export const aegisSources = {
  materials: "https://standards.nasa.gov/standard/NASA/NASA-STD-6001",
  structure: "https://ntrs.nasa.gov/citations/20220006243",
  blankets: "https://hvit.jsc.nasa.gov/shield-development/materials.html",
  battery: "https://ntrs.nasa.gov/citations/20220004129",
  fire: "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-008-fire-protection.pdf",
  life: "https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/",
};

export const rackDesigns = {
  separated: {
    label: "Subpaquetes separados con barrera de mica",
    conductance: 0.018,
  },
  shared: { label: "Montaje compartido sin separador", conductance: 0.22 },
};
export type RackDesign = keyof typeof rackDesigns;

// Effective values for the two thermal nodes. Scenario assumptions, not material coupon data.
export const aegisParameters = {
  failedCapacity: 14, // kJ/K
  neighborCapacity: 8, // kJ/K
  propagationC: 140,
  initialReleaseKJ: 5_000,
  adjacentReleaseKJ: 28_000,
  primaryPowerKW: 125,
  adjacentPowerKW: 330,
  thermalLossKWPerK: 0.11,
  waterKG: 5,
  waterDeliveryKgPerS: 0.075,
  effectiveCoolingKJPerKG: 650,
  ductExchangeM3PerS: 0.006,
  closedLeakM3PerS: 0.0005,
  refuge: {
    oxygenMol: 180,
    scrubberMol: 140,
    batteryKWh: 1.4,
    loadKW: 0.35,
    oxygenMolPerPersonSecond: 0.0003,
    co2MolPerPersonSecond: 0.00026,
  },
};

export interface AegisTelemetry {
  failedC: number;
  neighborC: number;
  packHeatKW: number;
  propagated: boolean;
  feedCut: boolean;
  ductsClosed: boolean;
  waterKG: number;
  refugeBatteryPercent: number;
  refugeOxygenPercent: number;
  refugeScrubberPercent: number;
}

export function newAegisRack(design?: RackDesign) {
  const p = aegisParameters;
  const conductance =
    rackDesigns[design ?? "separated"]?.conductance ??
    rackDesigns.separated.conductance;
  let failedK = 295;
  let neighborK = 295;
  let firstLeft = p.initialReleaseKJ;
  let adjacentLeft = p.adjacentReleaseKJ;
  let propagated = false;
  let waterKG = p.waterKG;

  return {
    step(dt: number, cabinK: number, active: boolean, cooling: boolean) {
      const firstKW = active ? Math.min(p.primaryPowerKW, firstLeft / dt) : 0;
      if (neighborK >= p.propagationC + 273.15) propagated = true;
      const adjacentKW = propagated
        ? Math.min(p.adjacentPowerKW, adjacentLeft / dt)
        : 0;
      firstLeft -= firstKW * dt;
      adjacentLeft -= adjacentKW * dt;

      const throughRackKW = conductance * (failedK - neighborK);
      const failedLoss = p.thermalLossKWPerK * (failedK - cabinK);
      const neighborLoss = p.thermalLossKWPerK * (neighborK - cabinK);
      const delivery =
        cooling && Math.max(failedK, neighborK) > 333.15
          ? Math.min(waterKG, p.waterDeliveryKgPerS * dt)
          : 0;
      // Only energy above coolant temperature can be transferred to the mist.
      const coolantBudgetKJ = delivery * p.effectiveCoolingKJPerKG;
      const directVentingKW = adjacentKW * 0.55;
      const failedEnergy = (firstKW - throughRackKW - failedLoss) * dt;
      const neighborEnergy = (adjacentKW - directVentingKW + throughRackKW - neighborLoss) * dt;
      const failedRemoved = Math.min(coolantBudgetKJ * 0.62, Math.max(0, (failedK - 295) * p.failedCapacity + failedEnergy));
      const neighborRemoved = Math.min(coolantBudgetKJ * 0.38, Math.max(0, (neighborK - 295) * p.neighborCapacity + neighborEnergy));
      waterKG = Math.max(0, waterKG - delivery);
      failedK += (failedEnergy - failedRemoved) / p.failedCapacity;
      neighborK += (neighborEnergy - neighborRemoved) / p.neighborCapacity;

      return {
        failedC: failedK - 273.15,
        neighborC: neighborK - 273.15,
        packHeatKW: firstKW + adjacentKW,
        cabinHeatKW: failedLoss + neighborLoss + directVentingKW,
        propagated,
        waterKG,
      };
    },
  };
}

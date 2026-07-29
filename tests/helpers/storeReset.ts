// tests/helpers/storeReset.ts
// Resets all Zustand stores to clean state between tests.

import { usePatientStore }      from '../../src/store/usePatientStore';
import { usePathologyStore }    from '../../src/store/usePathologyStore';
import { usePharmacologyStore } from '../../src/store/usePharmacologyStore';
import { useTimeStore }         from '../../src/store/useTimeStore';
import { useUIStore }           from '../../src/store/useUIStore';
import { useScenarioStore }     from '../../src/store/useScenarioStore';
import { useMonitoringStore }   from '../../src/store/useMonitoringStore';
import { useECMOStore }         from '../../src/store/useECMOStore';
import { useCRRTStore }         from '../../src/store/useCRRTStore';

export const VITALS_NEUTROS = {
  heartRate:              75,
  systolicBP:             120,
  diastolicBP:            75,
  meanArterialPressure:   90,
  spo2:                   98,
  paO2:                   95,
  paCO2:                  40,
  etco2:                  38,
  pH:                     7.40,
  hco3:                   24,
  respiratoryRate:        14,
  weight:                 70,
  lactate:                1.0,
  creatinine:             1.0,
  icp:                    12,
  gcs:                    15,
  urineOutput:            1.0,
  cardiacOutput:          5.0,
  temperature:            37.0,
};

export function resetAllStores(): void {
  // Time
  useTimeStore.getState().pause();
  useTimeStore.getState().reset();
  useTimeStore.getState().setSpeed(1);

  // Patient
  const pat = usePatientStore.getState();
  pat.resetFluidTracking();
  pat.setBloodVolume(5000);
  pat.updateVitals(VITALS_NEUTROS);
  pat.setProcedure('arterialLine', false);
  pat.setProcedure('picMonitor', false);
  pat.setProcedure('ecmo', false);
  pat.setProcedure('crrt', false);
  pat.setProcedure('urinaryCatheter', true);
  pat.setVentilatorConnected(false);

  // Pathology
  const path = usePathologyStore.getState();
  path.resetAllPathologies();
  path.setCaseCategory('general');

  // Pharmacology
  usePharmacologyStore.getState().resetAll();

  // UI
  const ui = useUIStore.getState();
  ui.setPiccoPanelVisible(true);
  ui.setPiccoQuickParams(['ci', 'gedi', 'evlwi', 'svv']);
  ui.setDripUnitMode('medical');

  // Scenario — only reset state without triggering full async applyScenario
  useScenarioStore.setState({
    isSimulationStarted: false,
    activeScenario:      null,
    activePatient:       null,
    launchError:         null,
    scenarioStartTick:   0,
  });

  // Monitoring
  useMonitoringStore.getState().clearMonitoring();
  useMonitoringStore.getState().setInvasiveMode('none');

  // ECMO / CRRT
  useECMOStore.getState().resetECMO();
  useCRRTStore.getState().resetCRRT();
}

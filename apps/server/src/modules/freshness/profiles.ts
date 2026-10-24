export const FRESHNESS_MODEL_VERSION = 'tomato-risk-v1-demo';

export type RipenessStage = 'GREEN' | 'TURNING' | 'PINK' | 'RED' | 'UNKNOWN';
export type StorageCondition = 'SHADE' | 'AMBIENT' | 'COOL_STORAGE' | 'UNKNOWN';
export type HandlingCondition = 'GOOD' | 'BRUISED' | 'ROUGH_HANDLING' | 'UNKNOWN';

export interface CropProfile {
  cropKey: string;
  displayName: string;
  aliases: string[];
  profileVersion: string;
  freshnessModelVersion: string;
  riskWeights: {
    ripeness: number;
    elapsedTime: number;
    temperatureExposure: number;
    routeDuration: number;
    handling: number;
  };
  /** A null window is intentional until a crop-specific table is reviewed. */
  estimatedLatestArrivalSupported: false;
}

export const TOMATO_CROP_PROFILE: CropProfile = {
  cropKey: 'tomato',
  displayName: 'Tomato',
  aliases: ['tomato', 'tomatoes'],
  profileVersion: 'tomato-profile-v1',
  freshnessModelVersion: FRESHNESS_MODEL_VERSION,
  riskWeights: {
    ripeness: 0.3,
    elapsedTime: 0.25,
    temperatureExposure: 0.25,
    routeDuration: 0.15,
    handling: 0.05,
  },
  estimatedLatestArrivalSupported: false,
};

export function getCropProfile(cropKey: string): CropProfile | null {
  const normalized = cropKey.trim().toLowerCase();
  return TOMATO_CROP_PROFILE.aliases.includes(normalized) ? TOMATO_CROP_PROFILE : null;
}

export interface FreshnessInput {
  cropKey: string;
  harvestedAt: Date | string;
  now?: Date;
  ripenessStage: RipenessStage;
  storageCondition: StorageCondition;
  storageTemperatureC?: number | null;
  routeDurationMinutes: number;
  handlingCondition: HandlingCondition;
}

export interface FreshnessEstimate {
  status: 'ESTIMATED' | 'INSUFFICIENT_DATA';
  score: number | null;
  band: 'LOWER' | 'MODERATE' | 'HIGHER' | null;
  modelVersion: string | null;
  profileVersion: string | null;
  confidence: 'LOW' | null;
  components: Record<string, number | null>;
  missingInputs: string[];
  warnings: string[];
  estimatedLatestArrivalAt: null;
  sourceLabel: 'SIMULATED_MODEL_ASSUMPTIONS' | null;
}

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));
const ripenessRisk: Partial<Record<RipenessStage, number>> = {
  GREEN: 10,
  TURNING: 30,
  PINK: 55,
  RED: 80,
};
const storageRisk: Partial<Record<StorageCondition, number>> = {
  COOL_STORAGE: 20,
  SHADE: 45,
  AMBIENT: 65,
};
const handlingRisk: Partial<Record<HandlingCondition, number>> = {
  GOOD: 10,
  BRUISED: 70,
  ROUGH_HANDLING: 90,
};

/**
 * An explainable demo risk score. Rubric values are versioned assumptions for
 * prototype evaluation, not validated spoilage probabilities or shelf-life.
 */
export function estimateFreshness(input: FreshnessInput): FreshnessEstimate {
  const profile = getCropProfile(input.cropKey);
  if (!profile) return insufficient(['cropKey'], 'Unsupported crop profile.');

  const now = input.now ?? new Date();
  const harvestedAt = input.harvestedAt instanceof Date
    ? input.harvestedAt
    : new Date(input.harvestedAt);
  const missing: string[] = [];
  if (Number.isNaN(harvestedAt.getTime())) missing.push('harvestedAt');
  else if (harvestedAt.getTime() > now.getTime()) missing.push('harvestedAt_not_in_future');
  if (input.ripenessStage === 'UNKNOWN' || ripenessRisk[input.ripenessStage] == null) {
    missing.push('ripenessStage');
  }
  if (input.storageCondition === 'UNKNOWN') missing.push('storageCondition');
  if (!Number.isFinite(input.routeDurationMinutes) || input.routeDurationMinutes < 0) {
    missing.push('routeDurationMinutes');
  }
  if (input.handlingCondition === 'UNKNOWN' || handlingRisk[input.handlingCondition] == null) {
    missing.push('handlingCondition');
  }
  if (input.storageTemperatureC != null && !Number.isFinite(input.storageTemperatureC)) {
    missing.push('storageTemperatureC');
  }
  if (missing.length) return insufficient(missing);

  const elapsedHours = Math.max(0, (now.getTime() - harvestedAt.getTime()) / 3_600_000);
  const tempRisk = input.storageTemperatureC == null
    ? storageRisk[input.storageCondition]!
    : input.storageTemperatureC <= 10
      ? 15
      : input.storageTemperatureC <= 20
        ? 35
        : input.storageTemperatureC <= 30
          ? 65
          : 90;
  const components = {
    ripenessRisk: ripenessRisk[input.ripenessStage]!,
    elapsedTimeRisk: clamp((elapsedHours / 48) * 100),
    temperatureExposureRisk: tempRisk,
    routeDurationRisk: clamp((input.routeDurationMinutes / (24 * 60)) * 100),
    handlingRisk: handlingRisk[input.handlingCondition]!,
  };
  const weights = profile.riskWeights;
  const score = Math.round(
    components.ripenessRisk * weights.ripeness +
      components.elapsedTimeRisk * weights.elapsedTime +
      components.temperatureExposureRisk * weights.temperatureExposure +
      components.routeDurationRisk * weights.routeDuration +
      components.handlingRisk * weights.handling,
  );

  return {
    status: 'ESTIMATED',
    score,
    band: score <= 34 ? 'LOWER' : score <= 64 ? 'MODERATE' : 'HIGHER',
    modelVersion: profile.freshnessModelVersion,
    profileVersion: profile.profileVersion,
    confidence: 'LOW',
    components,
    missingInputs: [],
    warnings: [
      'SIMULATED_MODEL_ASSUMPTIONS',
      ...(input.storageTemperatureC == null ? ['STORAGE_TEMPERATURE_NOT_MEASURED'] : []),
      'NOT_A_SPOILAGE_PROBABILITY_OR_SHELF_LIFE',
    ],
    estimatedLatestArrivalAt: null,
    sourceLabel: 'SIMULATED_MODEL_ASSUMPTIONS',
  };
}

function insufficient(missingInputs: string[], warning?: string): FreshnessEstimate {
  return {
    status: 'INSUFFICIENT_DATA',
    score: null,
    band: null,
    modelVersion: null,
    profileVersion: null,
    confidence: null,
    components: {},
    missingInputs,
    warnings: warning ? [warning] : [],
    estimatedLatestArrivalAt: null,
    sourceLabel: null,
  };
}

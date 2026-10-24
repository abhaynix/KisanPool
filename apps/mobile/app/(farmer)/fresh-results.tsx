import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, type FreshRecommendationSnapshot } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';
import { Banner, Button, Card, Chip, Header, Loading, Screen, Txt } from '../../components/ui';
import { ErrorView } from '../../components/ErrorView';
import { TripMap } from '../../components/TripMap';
import { colors, space } from '../../theme';

const RECOMMENDATION_SLOTS = [
  ['bestBalanced', 'Best balanced'],
  ['highestNetProceeds', 'Highest net proceeds'],
  ['fastestFeasible', 'Fastest feasible'],
  ['closestSuitable', 'Closest suitable'],
] as const;

function RecommendationSummary({ snapshot }: { snapshot: FreshRecommendationSnapshot }) {
  const recommendations = snapshot.recommendations as Record<string, unknown>;
  return (
    <>
      <Txt variant="headlineMd">Recommendation views</Txt>
      {RECOMMENDATION_SLOTS.map(([key, label]) => {
        const value = recommendations?.[key];
        return (
          <Card key={key} style={{ marginTop: space.sm }}>
            <Txt variant="labelLg">{label}</Txt>
            {value ? (
              <Txt variant="bodyMd" color={colors.onSurfaceVariant}>A candidate is available in this category. Review the option details and data warnings below.</Txt>
            ) : (
              <Txt variant="bodyMd" color={colors.onSurfaceVariant}>Unavailable: current price, market acceptance, and supported sale quantity are not all verified.</Txt>
            )}
          </Card>
        );
      })}
    </>
  );
}

export default function FreshResults() {
  const router = useRouter();
  const [presentation, setPresentation] = useState<'List' | 'Map'>('List');
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const result = useLoader<FreshRecommendationSnapshot>(
    useCallback(async () => {
      if (!id) throw new Error('Recommendation ID is missing.');
      return api.getFreshRecommendation(id);
    }, [id]),
  );
  const snapshot = result.data;

  if (result.loading && !snapshot) return <Screen><Header title="Market options" onBack={() => router.back()} /><Loading label="Loading your saved comparison…" /></Screen>;
  if (result.error && !snapshot) return <Screen><Header title="Market options" onBack={() => router.back()} /><ErrorView error={result.error} onRetry={() => void result.refresh()} /></Screen>;
  if (!snapshot) return <Screen><Header title="Market options" onBack={() => router.back()} /><Txt variant="bodyLg">This saved comparison could not be loaded.</Txt></Screen>;

  const submittedAt = new Date(snapshot.generatedAt).toLocaleString();
  return (
    <Screen onRefresh={() => void result.refresh()} refreshing={result.refreshing}>
      <Header title="Market comparison" subtitle={`Saved ${submittedAt}`} onBack={() => router.back()} />
      <Banner tone={snapshot.status === 'READY' ? 'info' : 'warning'} style={{ marginBottom: space.md }}>
        <Txt variant="labelLg">{snapshot.status === 'READY' ? 'Some options can be compared' : 'No verified feasible market yet'}</Txt>
        <Txt variant="bodyMd">The comparison is a saved snapshot. Refreshing this screen reloads the same result.</Txt>
      </Banner>

      <RecommendationSummary snapshot={snapshot} />

      <Txt variant="headlineMd" style={{ marginTop: space.lg }}>Reference market locations</Txt>
      <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.xs, marginBottom: space.sm }}>These are candidate locations only. Their current tomato acceptance and prices are unverified.</Txt>
      <View style={{ flexDirection: 'row', gap: space.xs, marginBottom: space.sm }}>
        {(['List', 'Map'] as const).map((mode) => <Chip key={mode} label={mode} selected={presentation === mode} onPress={() => setPresentation(mode)} />)}
      </View>
      {presentation === 'Map' ? (
        <TripMap
          pickup={{ lat: snapshot.input.pickup.lat, lng: snapshot.input.pickup.lng, title: 'Produce pickup' }}
          markers={snapshot.options.map((option) => ({ ...option.marketLocation, title: option.marketName }))}
          height={280}
        />
      ) : null}
      {snapshot.options.length === 0 ? (
        <Card><Txt variant="bodyMd">No reference locations were found within the search area.</Txt></Card>
      ) : snapshot.options.map((option) => (
        <Card key={option.marketId} style={{ marginBottom: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
            <Txt variant="labelLg" style={{ flex: 1 }}>{option.marketName}</Txt>
            <Txt variant="labelSm" color={colors.onSurfaceVariant}>{option.distanceFromPickupKm.toFixed(1)} km</Txt>
          </View>
          <Txt variant="bodyMd" color={colors.onSurfaceVariant}>Market acceptance: unverified · Live price: unavailable</Txt>
          {option.route ? (
            <Txt variant="bodyMd" color={colors.onSurfaceVariant}>
              Route estimate: {option.route.distanceKm.toFixed(1)} km · {Math.round(option.route.durationMinutes)} min · {option.route.estimateSource}
            </Txt>
          ) : <Txt variant="bodyMd" color={colors.onSurfaceVariant}>Route estimate unavailable.</Txt>}
          {option.transport.available ? (
            <Txt variant="bodyMd" color={colors.onSurfaceVariant}>
              Transport preview available{option.transport.farmerPayableINR != null ? ` · estimated farmer payable ₹${Math.round(option.transport.farmerPayableINR)}` : ''}. This is not a booking.
            </Txt>
          ) : <Txt variant="bodyMd" color={colors.onSurfaceVariant}>No available transport preview for this candidate.</Txt>}
          <Txt variant="bodyMd" color={colors.onSurfaceVariant}>
            Freshness: {option.freshness.status === 'ESTIMATED' && option.freshness.score != null ? `${option.freshness.band ?? 'Estimated'} (${option.freshness.score}/100)` : 'insufficient data'} · shelf life: not estimated
          </Txt>
          {option.warnings.map((warning) => <Txt key={warning} variant="labelSm" color={colors.onSurfaceVariant}>{warning.replaceAll('_', ' ').toLowerCase()}</Txt>)}
        </Card>
      ))}

      <Txt variant="headlineMd" style={{ marginTop: space.md }}>Data needed to make a recommendation</Txt>
      <Card style={{ marginTop: space.sm }}>
        {snapshot.missingData.map((item) => <Txt key={item} variant="bodyMd" color={colors.onSurfaceVariant}>• {item.replaceAll('_', ' ').toLowerCase()}</Txt>)}
        {snapshot.warnings.map((item) => <Txt key={item} variant="labelSm" color={colors.onSurfaceVariant}>{item.replaceAll('_', ' ').toLowerCase()}</Txt>)}
      </Card>
      <Button label="Start another comparison" icon="refresh" variant="secondary" onPress={() => router.replace('/(farmer)/fresh')} style={{ marginTop: space.md }} />
    </Screen>
  );
}

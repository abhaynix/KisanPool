import { useCallback, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, type FreshRecommendationSnapshot } from '../../lib/api';
import { useLoader } from '../../lib/useLoader';
import { Banner, Button, Card, Chip, Field, Header, Loading, Screen, Txt } from '../../components/ui';
import { ErrorView } from '../../components/ErrorView';
import { TripMap } from '../../components/TripMap';
import { colors, space } from '../../theme';

const RECOMMENDATION_SLOTS = [
  ['bestBalanced', 'Best balanced'],
  ['highestNetProceeds', 'Highest net proceeds'],
  ['fastestFeasible', 'Fastest feasible'],
  ['closestSuitable', 'Closest suitable'],
] as const;

function RecommendationSummary({ snapshot, onSelect, busy }: { snapshot: FreshRecommendationSnapshot; onSelect: (type: (typeof RECOMMENDATION_SLOTS)[number][0], confirmedAmount?: number) => void; busy: boolean }) {
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
              <>
                <Txt variant="bodyMd" color={colors.onSurfaceVariant}>A candidate is available in this category. Review the option details and data warnings below.</Txt>
                <Button label="Continue with this destination" loading={busy} onPress={() => onSelect(key)} style={{ marginTop: space.sm }} />
              </>
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
  const [marketName, setMarketName] = useState('');
  const [buyerLabel, setBuyerLabel] = useState('');
  const [buyerPrice, setBuyerPrice] = useState('');
  const [buyerQuantity, setBuyerQuantity] = useState('');
  const [buyerValidUntil, setBuyerValidUntil] = useState('');
  const [buyerBusy, setBuyerBusy] = useState(false);
  const [buyerError, setBuyerError] = useState<unknown>();
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState<unknown>();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const result = useLoader<FreshRecommendationSnapshot>(
    useCallback(async () => {
      if (!id) throw new Error('Recommendation ID is missing.');
      return api.getFreshRecommendation(id);
    }, [id]),
  );
  const snapshot = result.data;
  const buyerOffers = useLoader(
    useCallback(async () => id ? api.freshBuyerOffers(id) : [], [id]),
  );

  const shareSummary = async (value: FreshRecommendationSnapshot) => {
    const labels = RECOMMENDATION_SLOTS.filter(([key]) => Boolean((value.recommendations as Record<string, unknown>)?.[key])).map(([, label]) => label);
    await Share.share({
      title: 'KisanPool Fresh comparison',
      message: [
        `KisanPool Fresh · ${value.input.quantityKg} kg ${value.input.cropKey}`,
        labels.length ? `Available comparison views: ${labels.join(', ')}` : 'No verified feasible market recommendation is available yet.',
        'Market prices and acceptance must be verified. This summary contains no pickup contact details.',
      ].join('\n'),
    });
  };

  const saveBuyerOffer = async () => {
    if (!id || !marketName.trim() || !buyerPrice || !buyerValidUntil) return;
    setBuyerBusy(true);
    setBuyerError(undefined);
    try {
      await api.createFreshBuyerOffer(id, {
        marketName: marketName.trim(),
        buyerLabel: buyerLabel.trim() || undefined,
        priceINRPerKg: Number(buyerPrice),
        quantityKg: buyerQuantity ? Number(buyerQuantity) : undefined,
        validUntil: new Date(buyerValidUntil).toISOString(),
      });
      setMarketName(''); setBuyerLabel(''); setBuyerPrice(''); setBuyerQuantity(''); setBuyerValidUntil('');
      buyerOffers.refresh();
    } catch (err) {
      setBuyerError(err);
    } finally {
      setBuyerBusy(false);
    }
  };

  const selectRecommendation = async (type: (typeof RECOMMENDATION_SLOTS)[number][0], confirmation?: number) => {
    if (!id) return;
    setSelectionBusy(true);
    setSelectionError(undefined);
    try {
      const selected = await api.selectFreshRecommendation(id, type, confirmation);
      if (selected.reconfirmationRequired && selected.currentFarmerPayableINR != null) {
        Alert.alert('Transport estimate changed', `Current preview ₹${Math.round(selected.currentFarmerPayableINR)}. Continue to the regular transporter offer flow?`, [
          { text: 'Review later', style: 'cancel' },
          { text: 'Continue', onPress: () => void selectRecommendation(type, selected.currentFarmerPayableINR) },
        ]);
      } else if (selected.request?._id) {
        router.replace(`/(farmer)/requests/${selected.request._id}/offers`);
      }
    } catch (err) {
      setSelectionError(err);
    } finally {
      setSelectionBusy(false);
    }
  };

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

      <RecommendationSummary snapshot={snapshot} onSelect={(type, amount) => void selectRecommendation(type, amount)} busy={selectionBusy} />
      {selectionError ? <ErrorView error={selectionError} onRetry={() => { const first = RECOMMENDATION_SLOTS.find(([key]) => Boolean((snapshot.recommendations as Record<string, unknown>)?.[key])); if (first) void selectRecommendation(first[0]); }} /> : null}

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
      <Button label="Share safe summary" icon="share" variant="secondary" onPress={() => void shareSummary(snapshot)} style={{ marginTop: space.sm }} />

      <Txt variant="headlineMd" style={{ marginTop: space.lg }}>Record a buyer quote</Txt>
      <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.xs }}>This is farmer-reported and unverified; it will not be treated as a confirmed buyer offer.</Txt>
      <Field label="Market" value={marketName} onChangeText={setMarketName} placeholder="Market name" />
      <Field label="Buyer label (optional)" value={buyerLabel} onChangeText={setBuyerLabel} placeholder="Name or short label" />
      <Field label="Quoted price (₹/kg)" value={buyerPrice} onChangeText={(v) => setBuyerPrice(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Quantity offered (kg, optional)" value={buyerQuantity} onChangeText={(v) => setBuyerQuantity(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Quote valid until" value={buyerValidUntil} onChangeText={setBuyerValidUntil} placeholder="YYYY-MM-DDTHH:mm" />
      <Button label="Save unverified quote" icon="save" variant="secondary" loading={buyerBusy} disabled={!marketName.trim() || !buyerPrice || !buyerValidUntil || Number.isNaN(new Date(buyerValidUntil).getTime())} onPress={() => void saveBuyerOffer()} />
      {buyerError ? <ErrorView error={buyerError} onRetry={() => void saveBuyerOffer()} /> : null}
      {buyerOffers.data?.map((offer) => (
        <Card key={offer._id} style={{ marginTop: space.sm }}>
          <Txt variant="labelLg">{offer.marketName}: ₹{offer.priceINRPerKg}/kg</Txt>
          <Txt variant="labelSm" color={colors.onSurfaceVariant}>Farmer-reported · unverified · valid until {new Date(offer.validUntil).toLocaleString()}</Txt>
        </Card>
      ))}
    </Screen>
  );
}

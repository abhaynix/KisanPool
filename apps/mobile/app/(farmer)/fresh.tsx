import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GeoPoint } from '@kisanpool/shared';
import { api } from '../../lib/api';
import type { FreshRecommendationInput } from '../../lib/api';
import { getUser } from '../../lib/session';
import { Button, Card, Chip, Field, Header, Screen, Txt } from '../../components/ui';
import { ErrorView } from '../../components/ErrorView';
import { LocationPicker } from '../../components/LocationPicker';
import { colors, space } from '../../theme';
import { FRESH_DEMO_DATA_ENABLED } from '../../lib/featureFlags';

const RIPENESS: FreshRecommendationInput['ripenessStage'][] = ['GREEN', 'TURNING', 'PINK', 'RED', 'UNKNOWN'];
const STORAGE: FreshRecommendationInput['storageCondition'][] = ['SHADE', 'AMBIENT', 'COOL_STORAGE', 'UNKNOWN'];
const HANDLING: NonNullable<FreshRecommendationInput['handlingCondition']>[] = ['GOOD', 'BRUISED', 'ROUGH_HANDLING', 'UNKNOWN'];
const WINDOWS = ['Today', '12 hours', '24 hours', '48 hours', 'Custom', 'Flexible'] as const;
type WindowChoice = typeof WINDOWS[number];

function deadlineFor(choice: WindowChoice, custom: string, now: Date): string | undefined {
  if (choice === 'Flexible') return undefined;
  if (choice === 'Today') {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay.toISOString();
  }
  if (choice === 'Custom') {
    const parsed = new Date(custom);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  const hours = Number.parseInt(choice, 10);
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export default function FreshProduceForm() {
  const router = useRouter();
  const [quantity, setQuantity] = useState('');
  const [harvestedAt, setHarvestedAt] = useState('');
  const [ripeness, setRipeness] = useState<FreshRecommendationInput['ripenessStage']>('UNKNOWN');
  const [storage, setStorage] = useState<FreshRecommendationInput['storageCondition']>('UNKNOWN');
  const [temperature, setTemperature] = useState('');
  const [handling, setHandling] = useState<NonNullable<FreshRecommendationInput['handlingCondition']>>('UNKNOWN');
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [pickupTouched, setPickupTouched] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [windowChoice, setWindowChoice] = useState<WindowChoice>('Flexible');
  const [customDeadline, setCustomDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    void getUser().then((user) => {
      if (user?.defaultLocation && !pickupTouched) setPickup(user.defaultLocation);
    });
  }, [pickupTouched]);

  const parsedHarvest = new Date(harvestedAt);
  const harvestValid = harvestedAt.trim().length > 0 && !Number.isNaN(parsedHarvest.getTime()) && parsedHarvest <= new Date();
  const now = Date.now();
  // Avoid sending an `earliestPickupAt` timestamp that is already in the past
  // by the time the API validates it after network transit.
  const earliestPickupAt = now + 2 * 60_000;
  const deadline = deadlineFor(windowChoice, customDeadline, new Date(now));
  const quantityKg = Number(quantity);
  const temperatureValid = !temperature.trim() || (Number.isFinite(Number(temperature)) && Number(temperature) >= -30 && Number(temperature) <= 80);
  const deadlineValid = windowChoice !== 'Custom' || (Boolean(deadline) && new Date(deadline!).getTime() > earliestPickupAt);
  const valid = Number.isFinite(quantityKg) && quantityKg > 0 && harvestValid && Boolean(pickup) && temperatureValid && deadlineValid;

  const submit = async () => {
    if (!valid || !pickup) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await api.createFreshRecommendation({
        cropKey: 'tomato',
        quantityKg,
        harvestedAt: parsedHarvest.toISOString(),
        ripenessStage: ripeness,
        storageCondition: storage,
        storageTemperatureC: temperature.trim() ? Number(temperature) : undefined,
        handlingCondition: handling,
        pickup,
        earliestPickupAt: new Date(earliestPickupAt).toISOString(),
        desiredArrivalBy: deadline,
        searchRadiusKm: 100,
      });
      router.replace(`/(farmer)/fresh-results?id=${encodeURIComponent(result._id)}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const openDemoSnapshot = async () => {
    setDemoBusy(true);
    setError(undefined);
    try {
      const snapshot = await api.freshDemoSnapshot();
      router.push(`/(farmer)/fresh-results?id=${encodeURIComponent(snapshot._id)}`);
    } catch (err) {
      setError(err);
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <Screen footer={<Button label="Compare market options" loading={busy} disabled={!valid} onPress={() => void submit()} variant="primary" />}>
      <Header title="Fresh produce options" subtitle="Find a route for your harvested tomatoes" onBack={() => router.back()} />
      <Card style={{ marginBottom: space.md }}>
        <Txt variant="labelLg">Tomato is the currently supported crop</Txt>
        <Txt variant="bodyMd" color={colors.onSurfaceVariant}>More crops will appear when crop freshness profiles are available.</Txt>
      </Card>

      <Field label="Quantity (kg)" value={quantity} onChangeText={(value) => setQuantity(value.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 500" />
      <Field label="Harvest date and time" value={harvestedAt} onChangeText={setHarvestedAt} placeholder="2026-10-24T08:30" />
      {!harvestValid && harvestedAt ? <Txt variant="labelSm" color={colors.error}>Enter a valid past date and time.</Txt> : null}

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Ripeness</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
        {RIPENESS.map((value) => <Chip key={value} label={value.replace('_', ' ')} selected={ripeness === value} onPress={() => setRipeness(value)} />)}
      </View>
      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Storage since harvest</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
        {STORAGE.map((value) => <Chip key={value} label={value.replace('_', ' ')} selected={storage === value} onPress={() => setStorage(value)} />)}
      </View>
      {storage === 'COOL_STORAGE' ? <Field label="Storage temperature °C (optional)" value={temperature} onChangeText={(value) => setTemperature(value.replace(/[^0-9.-]/g, ''))} keyboardType="decimal-pad" placeholder="e.g. 8" /> : null}
      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Handling condition</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
        {HANDLING.map((value) => <Chip key={value} label={value.replace('_', ' ')} selected={handling === value} onPress={() => setHandling(value)} />)}
      </View>

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Produce pickup point</Txt>
      <Card onPress={() => setPickerOpen(true)} style={{ marginBottom: space.md }}>
        <Txt variant="labelLg">{pickup?.name ?? 'Choose pickup location'}</Txt>
        <Txt variant="labelSm" color={colors.onSurfaceVariant}>{pickup ? 'Tap to change the location' : 'Search, drop a pin, or use GPS'}</Txt>
      </Card>
      <LocationPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(point) => { setPickup(point); setPickupTouched(true); }} initial={pickup} title="Where are the tomatoes?" confirmLabel="Use this pickup" />

      {FRESH_DEMO_DATA_ENABLED ? (
        <Button label="Open synthetic comparison demo" icon="science" variant="secondary" loading={demoBusy} onPress={() => void openDemoSnapshot()} style={{ marginBottom: space.md }} />
      ) : null}

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Arrival timing</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
        {WINDOWS.map((value) => <Chip key={value} label={value} selected={windowChoice === value} onPress={() => setWindowChoice(value)} />)}
      </View>
      {windowChoice === 'Custom' ? <Field label="Arrival deadline (ISO date and time)" value={customDeadline} onChangeText={setCustomDeadline} placeholder="2026-10-25T08:30" /> : null}
      <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginBottom: space.md }}>Market locations are reference candidates. Current prices and crop acceptance may be unavailable, and the app will say so.</Txt>
      {!valid ? <Txt variant="labelSm" color={colors.error} style={{ marginBottom: space.md }}>
        To compare, enter a positive quantity and valid past harvest time, choose a pickup location, and check temperature or deadline values.
      </Txt> : null}
      {error ? <ErrorView error={error} onRetry={() => void submit()} /> : null}
    </Screen>
  );
}

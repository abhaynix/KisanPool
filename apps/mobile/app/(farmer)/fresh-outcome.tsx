import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { Button, Chip, Field, Header, Screen, Txt } from '../../components/ui';
import { ErrorView } from '../../components/ErrorView';
import { colors, space } from '../../theme';

const QUALITY = ['ACCEPTED', 'PARTIAL_REJECTION', 'REJECTED', 'NOT_REPORTED'] as const;

export default function FreshOutcomeForm() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const [pickupAt, setPickupAt] = useState('');
  const [deliveredAt, setDeliveredAt] = useState('');
  const [soldPrice, setSoldPrice] = useState('');
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [costs, setCosts] = useState('');
  const [quality, setQuality] = useState<(typeof QUALITY)[number]>('NOT_REPORTED');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  const submit = async () => {
    if (!requestId || !pickupAt || !deliveredAt || accepted === '' || rejected === '') return;
    setBusy(true);
    setError(undefined);
    try {
      await api.recordFreshDeliveryOutcome({
        requestId,
        actualPickupAt: new Date(pickupAt).toISOString(),
        actualDeliveredAt: new Date(deliveredAt).toISOString(),
        actualSoldPriceINRPerKg: soldPrice ? Number(soldPrice) : undefined,
        acceptedKg: Number(accepted),
        rejectedKg: Number(rejected),
        additionalCostsINR: costs ? Number(costs) : undefined,
        qualityOutcome: quality,
      });
      router.back();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const valid = Boolean(requestId && pickupAt && deliveredAt && !Number.isNaN(new Date(pickupAt).getTime()) && !Number.isNaN(new Date(deliveredAt).getTime()) && Number(accepted) >= 0 && Number(rejected) >= 0);
  return (
    <Screen footer={<Button label="Save reported outcome" loading={busy} disabled={!valid} onPress={() => void submit()} variant="primary" />}>
      <Header title="Fresh delivery outcome" subtitle="This report is saved as farmer-reported" onBack={() => router.back()} />
      <Field label="Actual pickup date and time" value={pickupAt} onChangeText={setPickupAt} placeholder="YYYY-MM-DDTHH:mm" />
      <Field label="Actual delivery date and time" value={deliveredAt} onChangeText={setDeliveredAt} placeholder="YYYY-MM-DDTHH:mm" />
      <Field label="Accepted quantity (kg)" value={accepted} onChangeText={(v) => setAccepted(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Rejected quantity (kg)" value={rejected} onChangeText={(v) => setRejected(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Selling price (₹/kg, optional)" value={soldPrice} onChangeText={(v) => setSoldPrice(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Field label="Additional costs (₹, optional)" value={costs} onChangeText={(v) => setCosts(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>Quality outcome</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.md }}>
        {QUALITY.map((item) => <Chip key={item} label={item.replaceAll('_', ' ').toLowerCase()} selected={quality === item} onPress={() => setQuality(item)} />)}
      </View>
      <Txt variant="bodyMd" color={colors.onSurfaceVariant}>Reported values are kept separate from buyer- or operator-verified evidence.</Txt>
      {error ? <ErrorView error={error} onRetry={() => void submit()} /> : null}
    </Screen>
  );
}

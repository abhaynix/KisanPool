/**
 * New transport request , crop, quantity, pickup, destination, notes.
 *
 * Submitting puts the request in the pool for nearby transporters to claim; it
 * does not book anything and costs nothing.
 */
import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { GeoPoint } from '@kisanpool/shared';
import { api, type ActiveFreshMarketDTO } from '../../../lib/api';
import { toAppError } from '../../../lib/errors';
import { getUser } from '../../../lib/session';
import { MANDIS } from '../../../lib/mandis';
import { Button, Card, Chip, Field, Header, Screen, Txt } from '../../../components/ui';
import { ErrorView } from '../../../components/ErrorView';
import { LocationPicker } from '../../../components/LocationPicker';
import { colors, space } from '../../../theme';

const CROPS = ['Onion', 'Tomato', 'Potato', 'Grapes', 'Other'];

export default function NewRequest() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    destinationName?: string;
    destinationLat?: string;
    destinationLng?: string;
    destName?: string;
    destLat?: string;
    destLng?: string;
    crop?: string;
    cropType?: string;
    quantity?: string;
    quantityKg?: string;
  }>();

  const destName = params.destinationName || params.destName;
  const destLat = params.destinationLat || params.destLat;
  const destLng = params.destinationLng || params.destLng;
  const initialCrop = params.crop || params.cropType || 'Onion';
  const initialQty = params.quantity || params.quantityKg || '';

  const matchedInitialCrop = CROPS.find((c) => c.toLowerCase() === initialCrop.toLowerCase());
  const [crop, setCrop] = useState(() => {
    return matchedInitialCrop || 'Other';
  });
  const [customCrop, setCustomCrop] = useState(() => {
    return matchedInitialCrop ? '' : initialCrop;
  });
  const [quantity, setQuantity] = useState(initialQty);
  const [notes, setNotes] = useState('');
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [destination, setDestination] = useState<GeoPoint | null>(
    destLat && destLng
      ? {
          name: destName ?? 'Mandi',
          lat: Number(destLat),
          lng: Number(destLng),
        }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [pickerOpen, setPickerOpen] = useState(false);
  /** true once the farmer has explicitly chosen , stops a late profile load stomping it */
  const [pickupTouched, setPickupTouched] = useState(false);

  const [liveMarkets, setLiveMarkets] = useState<ActiveFreshMarketDTO[]>([]);

  useEffect(() => {
    void getUser().then((user) => {
      // seed from the saved place ONLY as a starting suggestion; the farmer can
      // replace it, and a manual choice is never overwritten (the bug was this
      // value being forced with no way to change it)
      if (user?.defaultLocation && !pickupTouched) setPickup(user.defaultLocation);
    });
  }, [pickupTouched]);

  useEffect(() => {
    api.freshMarkets()
      .then((res) => {
        if (Array.isArray(res)) {
          setLiveMarkets(res);
        }
      })
      .catch((err) => {
        console.warn('Could not load fresh markets:', err);
      });
  }, []);

  const submit = async (): Promise<void> => {
    if (!pickup || !destination) return;
    setBusy(true);
    setError(undefined);
    try {
      const request = await api.createRequest({
        cropType: crop === 'Other' ? customCrop : crop,
        quantityKg: Number(quantity),
        pickup,
        destination,
        preferredDate: new Date().toISOString(),
        notes: notes.trim() || undefined,
      });
      router.replace(`/(farmer)/requests/${request._id}/offers`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const valid =
    Number(quantity) > 0 && pickup && destination && (crop !== 'Other' || customCrop.trim());

  return (
    <Screen
      footer={
        <Button
          label="Send to nearby transporters"
          loading={busy}
          disabled={!valid}
          onPress={() => void submit()}
         variant="primary"/>
      }
    >
      <Header title="What are you sending?" subtitle="काय पाठवायचं आहे?" onBack={() => router.back()} />

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>
        Crop
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
        {CROPS.map((item) => (
          <Chip key={item} label={item} selected={crop === item} onPress={() => setCrop(item)} />
        ))}
      </View>

      {crop === 'Other' ? (
        <Field label="Crop name" value={customCrop} onChangeText={setCustomCrop} placeholder="e.g. Pomegranate" />
      ) : null}

      <Field
        label="Quantity (kg)"
        value={quantity}
        onChangeText={(text) => setQuantity(text.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="e.g. 800"
      />

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>
        Pickup
      </Txt>
      <Card onPress={() => setPickerOpen(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="labelLg">{pickup?.name ?? 'Set a pickup location'}</Txt>
            <Txt variant="labelSm" color={colors.onSurfaceVariant}>
              {pickup ? 'Tap to search, drop a pin, or use GPS' : 'Choose where the produce is'}
            </Txt>
          </View>
          <Txt variant="labelLg" color={colors.primary}>
            {pickup ? 'Change' : 'Set'}
          </Txt>
        </View>
      </Card>

      <LocationPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initial={pickup}
        title="Where is the produce?"
        subtitle="This is where the transporter will collect from."
        confirmLabel="Use this pickup"
        onPick={(point) => {
          setPickup(point);
          setPickupTouched(true);
        }}
      />

      <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.sm }}>
        Destination Mandi
      </Txt>

      {/* Live Fresh Markets added by Admins / Operators */}
      {liveMarkets.length > 0 && (
        <View style={{ gap: space.sm, marginBottom: space.md }}>
          <Txt variant="labelSm" color={colors.primary} style={{ fontWeight: '700' }}>
            🌟 KisanPool Fresh Markets (Live Mandi Rates & Demands)
          </Txt>
          {liveMarkets.map((m) => {
            const isSelected = destination?.name === m.name;
            return (
              <Card
                key={`live-${m.id}`}
                onPress={() =>
                  setDestination({ name: m.name, lat: m.location.lat, lng: m.location.lng })
                }
                style={{
                  borderColor: isSelected ? colors.primary : colors.outlineVariant,
                  borderWidth: isSelected ? 2 : 1,
                  backgroundColor: isSelected ? `${colors.primaryContainer}20` : colors.surfaceContainer,
                  gap: space.xs,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Txt variant="labelLg" style={{ fontWeight: '700' }}>{m.name}</Txt>
                  {isSelected && (
                    <Txt variant="labelSm" style={{ color: colors.primary, fontWeight: '700' }}>
                      ✓ Selected
                    </Txt>
                  )}
                </View>
                <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ fontSize: 12 }}>
                  Comm: {m.commissionPct}% · Handling: ₹{m.handlingINRPerKg}/kg · {m.distanceKm} km door
                </Txt>

                {/* Show demands so farmers can fulfill custom market request with 1 tap */}
                {m.demands && m.demands.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Txt variant="labelSm" color={colors.onSurfaceVariant} style={{ fontSize: 11, marginBottom: 2 }}>
                      📦 Mandi ko chahiye (Tap to choose):
                    </Txt>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {m.demands.map((d) => (
                        <Pressable
                          key={d.crop}
                          onPress={() => {
                            setDestination({ name: m.name, lat: m.location.lat, lng: m.location.lng });
                            const cropMatch = CROPS.find((c) => c.toLowerCase() === d.crop.toLowerCase());
                            if (cropMatch) {
                              setCrop(cropMatch);
                              setCustomCrop('');
                            } else {
                              setCrop('Other');
                              setCustomCrop(d.crop);
                            }
                          }}
                          style={{
                            backgroundColor: colors.surfaceContainerHighest,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: colors.outlineVariant,
                          }}
                        >
                          <Txt variant="labelSm" style={{ color: colors.primary, fontWeight: '600', fontSize: 11 }}>
                            {d.crop.toUpperCase()} {d.pricePerKg > 0 ? `· ₹${d.pricePerKg}/kg` : ''} ➔
                          </Txt>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* APMC Reference Mandis */}
      <Txt variant="labelSm" color={colors.onSurfaceVariant} style={{ marginBottom: space.xs }}>
        Other APMC Mandis
      </Txt>
      {MANDIS.filter((m) => !liveMarkets.some((lm) => lm.name.toLowerCase() === m.name.toLowerCase())).map((mandi) => {
        const selected = destination?.name === mandi.name;
        return (
          <Card
            key={mandi.id}
            onPress={() =>
              setDestination({ name: mandi.name, lat: mandi.lat, lng: mandi.lng })
            }
            style={{
              borderColor: selected ? colors.primary : colors.outlineVariant,
              borderWidth: selected ? 2 : 1,
              marginBottom: space.xs,
            }}
          >
            <Txt variant="labelLg">{mandi.name}</Txt>
            <Txt variant="labelSm" color={colors.onSurfaceVariant}>
              {mandi.district}
            </Txt>
          </Card>
        );
      })}

      <Field
        label="Anything the driver should know? (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. 20 crates, needs help loading"
        multiline
        numberOfLines={3}
        style={{ marginTop: space.md }}
      />

      {error ? <ErrorView error={error} onRetry={() => void submit()} /> : null}
    </Screen>
  );
}

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Screen, Header, Txt, Card, Button, Field, SectionHeader } from '../../components/ui';
import { getUser } from '../../lib/session';
import { colors, space, radius } from '../../theme';

interface CropOption {
  id: string;
  name: string;
  marathi: string;
  icon: string;
  isCustom?: boolean;
}

export default function FreshProduceFormScreen() {
  const router = useRouter();

  const [selectedCropId, setSelectedCropId] = useState<string>('tomato');
  const [customCropName, setCustomCropName] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState<'kg' | 'quintal' | 'tonne'>('kg');
  const [condition, setCondition] = useState<string>('Turning');
  const [deadlineHours, setDeadlineHours] = useState<number | null>(24);
  const [harvestAt] = useState<string>(new Date().toISOString());
  const [pickup, setPickup] = useState<{ name?: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    void getUser().then((user) => {
      if (user?.defaultLocation) {
        setPickup({
          name: user.defaultLocation.name,
          lat: user.defaultLocation.lat,
          lng: user.defaultLocation.lng,
        });
      }
    });
  }, []);

  const CROPS: CropOption[] = [
    { id: 'tomato', name: 'Tomato', marathi: 'टोमॅटो (Tamatar)', icon: '🍅' },
    { id: 'onion', name: 'Onion', marathi: 'कांदा (Pyaaz)', icon: '🧅' },
    { id: 'grapes', name: 'Grapes', marathi: 'द्राक्षे (Angoor)', icon: '🍇' },
    { id: 'potato', name: 'Potato', marathi: 'बटाटा (Aloo)', icon: '🥔' },
    { id: 'custom', name: 'Other Produce', marathi: 'इतर / Custom Fasal', icon: '🌿', isCustom: true },
  ];

  const CONDITIONS = [
    { id: 'Green', label: 'Green', sub: 'कच्चा (Low transit loss)', color: '#22c55e' },
    { id: 'Turning', label: 'Turning', sub: 'पिकत आहे (Balanced)', color: '#eab308' },
    { id: 'Ripe', label: 'Ripe', sub: 'तयार (Best Mandi Rate)', color: '#f97316' },
    { id: 'Fully ripe', label: 'Fully Ripe', sub: 'जास्त पिकलेला (Send fast)', color: '#ef4444' },
    { id: 'Unknown', label: 'Unknown', sub: 'अंदाजे', color: '#6b7280' },
  ];

  const DEADLINES: Array<{ hours: number | null; label: string; sub: string }> = [
    { hours: 8, label: 'Aaj hi', sub: '8 Ghante' },
    { hours: 12, label: '12 Hours', sub: 'Emergency' },
    { hours: 24, label: '24 Hours', sub: 'Standard' },
    { hours: 48, label: '48 Hours', sub: 'Relaxed' },
    { hours: null, label: 'No Deadline', sub: 'Anytime' },
  ];

  const UNITS: Array<'kg' | 'quintal' | 'tonne'> = ['kg', 'quintal', 'tonne'];

  const effectiveCrop =
    selectedCropId === 'custom'
      ? customCropName.trim().toLowerCase() || 'other'
      : selectedCropId;

  const handleCompare = () => {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      alert('Kripya sahi quantity dalein (0 se zyada)');
      return;
    }

    if (selectedCropId === 'custom' && !customCropName.trim()) {
      alert('Kripya apni custom fasal ka naam likhein');
      return;
    }

    router.push({
      pathname: '/(farmer)/fresh-results',
      params: {
        crop: effectiveCrop,
        quantity: String(qty),
        unit,
        condition,
        deadlineHours: deadlineHours !== null ? String(deadlineHours) : '',
        harvestAt,
        pickupLat: pickup ? String(pickup.lat) : '',
        pickupLng: pickup ? String(pickup.lng) : '',
        pickupName: pickup?.name || '',
      },
    });
  };

  const handleAddQuantity = (amount: number) => {
    const current = Number(quantity) || 0;
    setQuantity(String(current + amount));
  };

  return (
    <Screen>
      <Header
        title="Fresh Produce Mandi Engine"
        subtitle="ताजा भाजीपाला थेट बाजारभाव"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Hero Banner */}
        <Card style={styles.bannerCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={styles.bannerIconBadge}>
              <MaterialIcons name="trending-up" size={24} color="#15803d" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="headlineMd" style={{ color: '#166534', fontWeight: '700' }}>
                Mandi Bhav & Transit Loss
              </Txt>
              <Txt variant="bodyMd" style={{ color: '#14532d', marginTop: 2 }}>
                Live mandi rates, transit degradation aur transport cost jod kar sabse behtar munafa payein.
              </Txt>
            </View>
          </View>
          {pickup && (
            <View style={styles.pickupLocationStrip}>
              <MaterialIcons name="place" size={16} color="#15803d" />
              <Txt variant="labelSm" style={{ color: '#166534', flex: 1 }} numberOfLines={1}>
                Farm Location: {pickup.name || `${pickup.lat.toFixed(2)}, ${pickup.lng.toFixed(2)}`}
              </Txt>
            </View>
          )}
        </Card>

        {/* 1. Crop Picker */}
        <SectionHeader title="1. Fasal Chunein (Select Produce)" />
        <View style={styles.cropGrid}>
          {CROPS.map((c) => {
            const isSelected = selectedCropId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelectedCropId(c.id)}
                style={[styles.cropCard, isSelected && styles.cropCardSelected]}
              >
                <Txt variant="headlineMd">{c.icon}</Txt>
                <Txt
                  variant="labelLg"
                  style={{
                    color: isSelected ? colors.primary : colors.onSurface,
                    fontWeight: isSelected ? '700' : '600',
                    marginTop: 4,
                  }}
                >
                  {c.name}
                </Txt>
                <Txt
                  variant="labelSm"
                  style={{
                    color: isSelected ? colors.primary : colors.onSurfaceVariant,
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                  numberOfLines={1}
                >
                  {c.marathi}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {/* Custom Crop Input if "custom" selected */}
        {selectedCropId === 'custom' && (
          <Card style={styles.customCropBox}>
            <Txt variant="labelLg" style={{ color: colors.primary, marginBottom: 4 }}>
              🌿 Custom Produce Details (Mandi Demand Fulfill Karein)
            </Txt>
            <Field
              label="Apni Fasal Ka Naam"
              placeholder="e.g. Pomegranate, Ginger, Shimla Mirch, Soyabean"
              value={customCropName}
              onChangeText={setCustomCropName}
              style={{ marginBottom: 0 }}
            />
          </Card>
        )}

        {/* 2. Quantity & Unit */}
        <SectionHeader title="2. Quantity & Wajan (Weight)" />
        <Card style={styles.formCard}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <View style={{ flex: 1.2 }}>
              <Field
                label="Quantity"
                keyboardType="numeric"
                value={quantity}
                onChangeText={(t) => setQuantity(t.replace(/\D/g, ''))}
                placeholder="100"
                style={{ marginBottom: 0 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.xs }}>
                Unit
              </Txt>
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                {UNITS.map((u) => {
                  const selected = unit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setUnit(u)}
                      style={[styles.unitChip, selected && styles.unitChipSelected]}
                    >
                      <Txt
                        variant="labelSm"
                        style={{
                          color: selected ? '#ffffff' : colors.onSurface,
                          fontWeight: selected ? '700' : '500',
                        }}
                      >
                        {u}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Quick Steppers */}
          <View style={styles.stepperRow}>
            <Txt variant="labelSm" color={colors.onSurfaceVariant}>
              Quick Add:
            </Txt>
            {[
              { label: '+50 kg', val: 50 },
              { label: '+100 kg', val: 100 },
              { label: '+500 kg', val: 50 },
              { label: '+1 Tonne', val: 1000 },
            ].map((s) => (
              <Pressable key={s.label} onPress={() => handleAddQuantity(s.val)} style={styles.stepperChip}>
                <Txt variant="labelSm" style={{ color: colors.primary, fontWeight: '600' }}>
                  {s.label}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* 3. Ripeness & Condition */}
        <SectionHeader title="3. Fasal Ki Haalat (Ripeness & Loss)" />
        <Card style={styles.formCard}>
          <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginBottom: space.sm }}>
            Taaza fasal ki ripeness transit degradation calculate karne ke liye zaroori hai:
          </Txt>
          <View style={styles.conditionGrid}>
            {CONDITIONS.map((cond) => {
              const selected = condition === cond.id;
              return (
                <Pressable
                  key={cond.id}
                  onPress={() => setCondition(cond.id)}
                  style={[
                    styles.conditionCard,
                    selected && { borderColor: cond.color, backgroundColor: `${cond.color}15`, borderWidth: 2 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.colorDot, { backgroundColor: cond.color }]} />
                    <Txt variant="labelLg" style={{ fontWeight: selected ? '700' : '600' }}>
                      {cond.label}
                    </Txt>
                  </View>
                  <Txt variant="labelSm" style={{ color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>
                    {cond.sub}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 4. Arrival Deadline */}
        <SectionHeader title="4. Kab Tak Mandi Pahunchna Hai? (Deadline)" />
        <Card style={styles.formCard}>
          <View style={styles.deadlinesGrid}>
            {DEADLINES.map((dl) => {
              const selected = deadlineHours === dl.hours;
              return (
                <Pressable
                  key={String(dl.hours)}
                  onPress={() => setDeadlineHours(dl.hours)}
                  style={[styles.deadlineCard, selected && styles.deadlineCardSelected]}
                >
                  <Txt
                    variant="labelLg"
                    style={{
                      color: selected ? colors.primary : colors.onSurface,
                      fontWeight: selected ? '700' : '500',
                    }}
                  >
                    {dl.label}
                  </Txt>
                  <Txt
                    variant="labelSm"
                    style={{
                      color: selected ? colors.primary : colors.onSurfaceVariant,
                      fontSize: 11,
                    }}
                  >
                    {dl.sub}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* Action Button */}
        <Button
          label="Mandi Bhav Aur Munafa Compare Karein →"
          variant="primary"
          onPress={handleCompare}
          style={{ marginTop: space.lg, marginBottom: space.xl }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    gap: space.sm,
  },
  bannerCard: {
    padding: space.md,
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: radius.md,
    gap: space.sm,
  },
  bannerIconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupLocationStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: '#dcfce7',
  },
  cropGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  cropCard: {
    flex: 1,
    minWidth: '28%',
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
    elevation: 2,
  },
  customCropBox: {
    padding: space.md,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  formCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
    gap: space.sm,
  },
  unitChip: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
  },
  stepperChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerLow,
  },
  conditionGrid: {
    gap: space.xs,
  },
  conditionCard: {
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  deadlinesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  deadlineCard: {
    flex: 1,
    minWidth: '45%',
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  deadlineCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.surfaceContainerHigh,
  },
});

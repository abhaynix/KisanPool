import { useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, Txt, Card, Button, Field, SectionHeader } from '../../components/ui';
import { colors, space, radius } from '../../theme';

export default function FreshProduceFormScreen() {
  const router = useRouter();

  const [crop, setCrop] = useState<'tomato' | 'onion' | 'grapes'>('tomato');
  const [quantity, setQuantity] = useState('100');
  const [unit, setUnit] = useState<'kg' | 'quintal' | 'tonne'>('kg');
  const [condition, setCondition] = useState<string>('Turning');
  const [deadlineHours, setDeadlineHours] = useState<number | null>(24);
  const [harvestAt] = useState<string>(new Date().toISOString());

  const handleCompare = () => {
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
      alert('Kripya sahi quantity dalein (0 se zyada)');
      return;
    }

    router.push({
      pathname: '/(farmer)/fresh-results',
      params: {
        crop,
        quantity: String(qty),
        unit,
        condition,
        deadlineHours: deadlineHours !== null ? String(deadlineHours) : '',
        harvestAt,
      },
    });
  };

  const CROPS: Array<{ id: 'tomato' | 'onion' | 'grapes'; label: string; icon: string }> = [
    { id: 'tomato', label: 'Tomato (Tamatar)', icon: '🍅' },
    { id: 'onion', label: 'Onion (Pyaaz)', icon: '🧅' },
    { id: 'grapes', label: 'Grapes (Angoor)', icon: '🍇' },
  ];

  const CONDITIONS = [
    { id: 'Green', label: 'Green (Kaccha)' },
    { id: 'Turning', label: 'Turning (Pak raha hai)' },
    { id: 'Ripe', label: 'Ripe (Taiyar)' },
    { id: 'Fully ripe', label: 'Fully ripe (Zyada paka)' },
    { id: 'Unknown', label: 'Unknown (Andaza nahi)' },
  ];

  const DEADLINES: Array<{ hours: number | null; label: string }> = [
    { hours: 8, label: 'Aaj hi (8h)' },
    { hours: 12, label: '12 Ghante' },
    { hours: 24, label: '24 Ghante' },
    { hours: 48, label: '48 Ghante' },
    { hours: null, label: 'No deadline' },
  ];

  const UNITS: Array<'kg' | 'quintal' | 'tonne'> = ['kg', 'quintal', 'tonne'];

  return (
    <Screen>
      <Header
        title="Fresh Produce Recommendation"
        subtitle="ताजी भाजीपाला शिफारस"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Banner */}
        <Card style={styles.bannerCard}>
          <Txt variant="headlineMd" style={{ color: colors.primary }}>
            Taaza Fasal, Behtar Bhav
          </Txt>
          <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginTop: space.xs }}>
            Mandi ka live bhav, transit loss aur transport cost jod kar sabse zyada munafa calculate karein.
          </Txt>
        </Card>

        {/* 1. Crop Picker */}
        <SectionHeader title="1. Crop Chunein (Select Crop)" />
        <View style={styles.chipRow}>
          {CROPS.map((c) => {
            const selected = crop === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCrop(c.id)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Txt variant="bodyLg">{c.icon}</Txt>
                <Txt
                  variant="labelLg"
                  style={{ color: selected ? colors.onPrimary : colors.onSurface, marginLeft: space.xs }}
                >
                  {c.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        {/* 2. Quantity and Unit */}
        <SectionHeader title="2. Quantity & Unit" />
        <Card style={styles.formCard}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Quantity"
                keyboardType="numeric"
                value={quantity}
                onChangeText={setQuantity}
                placeholder="100"
                style={{ marginBottom: 0 }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={{ marginBottom: space.xs }}>
                Unit
              </Txt>
              <View style={{ flexDirection: 'row', gap: space.xs, marginTop: 4 }}>
                {UNITS.map((u) => {
                  const selected = unit === u;
                  return (
                    <Pressable
                      key={u}
                      onPress={() => setUnit(u)}
                      style={[styles.smallChip, selected && styles.chipSelected]}
                    >
                      <Txt
                        variant="labelSm"
                        style={{ color: selected ? colors.onPrimary : colors.onSurface }}
                      >
                        {u}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </Card>

        {/* 3. Harvest Condition */}
        <SectionHeader title="3. Fasal Ki Haalat (Crop Condition)" />
        <Card style={styles.formCard}>
          <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginBottom: space.sm }}>
            Transit degradation rate harvest ripeness par nirbhar karti hai:
          </Txt>
          <View style={styles.wrapRow}>
            {CONDITIONS.map((cond) => {
              const selected = condition === cond.id;
              return (
                <Pressable
                  key={cond.id}
                  onPress={() => setCondition(cond.id)}
                  style={[styles.conditionChip, selected && styles.chipSelected]}
                >
                  <Txt
                    variant="labelSm"
                    style={{ color: selected ? colors.onPrimary : colors.onSurface }}
                  >
                    {cond.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 4. Arrival Deadline */}
        <SectionHeader title="4. Kab Tak Pahunchna Hai? (Deadline)" />
        <Card style={styles.formCard}>
          <View style={styles.wrapRow}>
            {DEADLINES.map((dl) => {
              const selected = deadlineHours === dl.hours;
              return (
                <Pressable
                  key={String(dl.hours)}
                  onPress={() => setDeadlineHours(dl.hours)}
                  style={[styles.conditionChip, selected && styles.chipSelected]}
                >
                  <Txt
                    variant="labelSm"
                    style={{ color: selected ? colors.onPrimary : colors.onSurface }}
                  >
                    {dl.label}
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
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  smallChip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionChip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  formCard: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
  },
});

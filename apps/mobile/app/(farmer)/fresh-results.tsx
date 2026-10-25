import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Share, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Header, Txt, Card, Button } from '../../components/ui';
import { TripMap } from '../../components/TripMap';
import { api, type FreshMarketItemDTO, type FreshRecommendationResponse } from '../../lib/api';
import { colors, space, radius } from '../../theme';

function Badge({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'special';
}) {
  const bg =
    tone === 'special'
      ? colors.primaryContainer
      : tone === 'success'
      ? '#dcfce7'
      : tone === 'warning'
      ? '#fef3c7'
      : tone === 'danger'
      ? '#fee2e2'
      : colors.surfaceContainerHighest;
  const fg =
    tone === 'special'
      ? colors.onPrimaryContainer
      : tone === 'success'
      ? '#166534'
      : tone === 'warning'
      ? '#92400e'
      : tone === 'danger'
      ? '#991b1b'
      : colors.onSurfaceVariant;
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm }}>
      <Txt variant="labelSm" style={{ color: fg }}>
        {label}
      </Txt>
    </View>
  );
}

export default function FreshResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    crop?: string;
    quantity?: string;
    unit?: string;
    condition?: string;
    deadlineHours?: string;
    harvestAt?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FreshRecommendationResponse | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  const crop = params.crop || 'tomato';
  const quantity = Number(params.quantity || '100');
  const unit = params.unit || 'kg';
  const condition = params.condition || 'Turning';
  const deadlineHours = params.deadlineHours ? Number(params.deadlineHours) : null;
  const harvestAt = params.harvestAt || new Date().toISOString();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.freshRecommendations({
        crop,
        quantity,
        unit,
        condition,
        deadlineHours,
        harvestAt,
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Recommendation load nahi ho saki');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [crop, quantity, unit, condition, deadlineHours, harvestAt]);

  const handleShare = async (market: FreshMarketItemDTO) => {
    try {
      const message =
        `🌾 KisanPool Fresh Recommendation\n` +
        `Mandi: ${market.name}\n` +
        `Fasal: ${crop.toUpperCase()} (${market.saleableKg} kg)\n` +
        `Bhav: ₹${market.pricePerKg}/kg\n` +
        `Transport: ₹${market.costs.transport}\n` +
        `Expected Net: ₹${market.net.toLocaleString('en-IN')}\n` +
        `KisanPool - Safe Shared Produce Transport`;
      await Share.share({ message });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleContinue = (market: FreshMarketItemDTO) => {
    router.push({
      pathname: '/(farmer)/requests/new',
      params: {
        destinationName: market.name,
        destinationLat: String(market.location.lat),
        destinationLng: String(market.location.lng),
        cropType: crop,
        quantityKg: String(market.saleableKg || quantity || 100),
      },
    });
  };

  const handleSendCustomCrop = (market: FreshMarketItemDTO, targetCrop: string) => {
    router.push({
      pathname: '/(farmer)/requests/new',
      params: {
        destinationName: market.name,
        destinationLat: String(market.location.lat),
        destinationLng: String(market.location.lng),
        cropType: targetCrop,
        quantityKg: String(quantity || 100),
      },
    });
  };

  const renderMarketCard = (
    market: FreshMarketItemDTO,
    pickType?: 'BALANCED' | 'BEST_PROFIT' | 'NEAREST',
  ) => {
    const isRecommended = pickType === 'BALANCED';
    const pickLabel =
      pickType === 'BALANCED'
        ? 'BALANCED (Recommended)'
        : pickType === 'BEST_PROFIT'
        ? 'BEST PROFIT (Sabse Zyada Munafa)'
        : pickType === 'NEAREST'
        ? 'NEAREST (Sabse Nazdeek)'
        : null;

    const sourceLabel =
      market.priceSource === 'DEMO'
        ? 'Demo data'
        : market.priceSource === 'OPERATOR'
        ? 'Operator'
        : 'Official';

    return (
      <Card
        key={`${pickType || 'market'}-${market.id}`}
        style={[styles.card, isRecommended && styles.recommendedCard]}
      >
        {/* Header Badges */}
        <View style={styles.cardHeaderRow}>
          {pickLabel && (
            <Badge tone={isRecommended ? 'special' : 'success'} label={pickLabel} />
          )}
          {data?.nearTie && (
            <Badge tone="warning" label="lagbhag barabar" />
          )}
        </View>

        {/* Title and Distance */}
        <View style={{ marginTop: space.xs }}>
          <Txt variant="headlineMd">{market.name}</Txt>
          <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
            {market.distanceKm} km door · ETA {market.etaMin} min
            {market.approxDistance ? ' (approx distance)' : ''}
          </Txt>
        </View>

        {/* Price & Provenance */}
        <View style={styles.priceRow}>
          <View>
            <Txt variant="headlineLg" style={{ color: colors.primary }}>
              ₹{market.pricePerKg.toFixed(1)}/kg
            </Txt>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant }}>
              Listed: ₹{market.rawPrice}/{market.rawUnit}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Badge tone="default" label={sourceLabel} />
            <Badge
              tone={
                market.freshness === 'fresh'
                  ? 'success'
                  : market.freshness === 'stale'
                  ? 'warning'
                  : 'danger'
              }
              label={`${market.priceAgeHours}h pehle (${market.freshness})`}
            />
          </View>
        </View>

        {/* Financials & Loss Breakdown */}
        <View style={styles.breakdownBox}>
          <View style={styles.infoRow}>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant }}>
              Saleable Quantity:
            </Txt>
            <Txt variant="labelLg">
              {market.saleableKg} kg ({market.lossPct}% transit loss)
            </Txt>
          </View>

          <View style={styles.infoRow}>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant }}>
              Total Costs:
            </Txt>
            <Txt variant="labelLg">
              ₹{market.costs.transport + market.costs.commission + market.costs.handling}
            </Txt>
          </View>

          <View style={[styles.infoRow, { paddingLeft: space.sm }]}>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
              ↳ Transport: ₹{market.costs.transport} · Comm: ₹{market.costs.commission} · Handl: ₹{market.costs.handling}
            </Txt>
          </View>

          <View style={[styles.infoRow, styles.netRow]}>
            <Txt variant="headlineMd" style={{ color: colors.onSurface }}>
              Expected Net:
            </Txt>
            <Txt variant="headlineMd" style={{ color: '#16a34a' }}>
              ₹{market.net.toLocaleString('en-IN')}
            </Txt>
          </View>
        </View>

        {/* Plain Hindi-English Reason text */}
        <View style={styles.reasonBox}>
          <Txt variant="bodyMd" style={{ fontStyle: 'italic', color: colors.onSurface }}>
            💬 {market.reasonText}
          </Txt>
        </View>

        {/* Warnings */}
        {market.warnings.length > 0 && (
          <View style={styles.warningsBox}>
            {market.warnings.map((w, idx) => (
              <Txt key={idx} variant="bodyMd" style={{ color: '#d97706', fontSize: 12 }}>
                ⚠ {w}
              </Txt>
            ))}
          </View>
        )}

        {/* Market Requirements / Demanded produce */}
        {market.demands && market.demands.length > 0 && (
          <View style={styles.demandBox}>
            <Txt variant="labelSm" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
              📦 Mandi ki zaroorat (Tap crop to fulfill demand):
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {market.demands.map((d) => (
                <Pressable
                  key={d.crop}
                  onPress={() => handleSendCustomCrop(market, d.crop)}
                  style={styles.demandChip}
                >
                  <Txt variant="labelSm" style={{ color: colors.primary, fontWeight: '700' }}>
                    {d.crop.toUpperCase()}
                  </Txt>
                  {d.pricePerKg > 0 ? (
                    <Txt variant="labelSm" style={{ color: colors.onSurface }}>
                      {' '}· ₹{d.pricePerKg}/kg
                    </Txt>
                  ) : (
                    <Txt variant="labelSm" style={{ color: colors.onSurfaceVariant }}>
                      {' '}· Open
                    </Txt>
                  )}
                  <Txt variant="labelSm" style={{ color: colors.primary, marginLeft: 2 }}>
                    ➔
                  </Txt>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Button
            label="Share"
            variant="secondary"
            icon="share"
            onPress={() => handleShare(market)}
            style={{ flex: 1 }}
          />
          <Button
            label="Custome Request Bhejo"
            variant="primary"
            icon="arrow-forward"
            onPress={() => handleContinue(market)}
            style={{ flex: 2 }}
          />
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      <Header title="Comparison Results" subtitle="तुलना परिणाम" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.container}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Txt variant="bodyMd" style={{ marginTop: space.md, color: colors.onSurfaceVariant }}>
              Mandis ka bhav aur loss calculate ho raha hai…
            </Txt>
          </View>
        ) : error ? (
          <Card style={styles.emptyCard}>
            <Txt variant="headlineMd" style={{ color: colors.error }}>
              {error}
            </Txt>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginTop: space.sm }}>
              Admin se market/price add karwao.
            </Txt>
            <Button
              label="Try Again"
              variant="secondary"
              onPress={loadData}
              style={{ marginTop: space.md }}
            />
          </Card>
        ) : data?.emptyReason || !data?.markets.length ? (
          <Card style={styles.emptyCard}>
            <Txt variant="headlineMd" style={{ color: colors.onSurface }}>
              {data?.emptyReason || 'Koi market is crop ko accept nahi karta'}
            </Txt>
            <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, marginTop: space.sm }}>
              Admin se market/price add karwao.
            </Txt>
            <Button
              label="Back to Form"
              variant="primary"
              onPress={() => router.back()}
              style={{ marginTop: space.md }}
            />
          </Card>
        ) : (
          <>
            {/* Top Banner if Extra vs Nearest > 0 */}
            {data.extraVsNearest > 0 && (
              <Card style={styles.extraBanner}>
                <Txt variant="labelLg" style={{ color: '#166534', fontWeight: 'bold' }}>
                  🎉 Nearest se ₹{data.extraVsNearest.toLocaleString('en-IN')} zyada kamaoge!
                </Txt>
                <Txt variant="bodyMd" style={{ color: '#14532d', marginTop: 2 }}>
                  Best Profit mandi chunein aur apna munafa badhayein.
                </Txt>
              </Card>
            )}

            {/* Map / List View Toggle */}
            <View style={styles.toggleRow}>
              <Txt variant="labelLg" style={{ color: colors.onSurfaceVariant }}>
                View:
              </Txt>
              <View style={styles.toggleGroup}>
                <Pressable
                  onPress={() => setViewMode('list')}
                  style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
                >
                  <Txt
                    variant="labelSm"
                    style={{ color: viewMode === 'list' ? colors.onPrimary : colors.onSurface }}
                  >
                    List ({data.markets.length})
                  </Txt>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('map')}
                  style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
                >
                  <Txt
                    variant="labelSm"
                    style={{ color: viewMode === 'map' ? colors.onPrimary : colors.onSurface }}
                  >
                    Map
                  </Txt>
                </Pressable>
              </View>
            </View>

            {/* Map View */}
            {viewMode === 'map' && (
              <View style={{ marginBottom: space.md }}>
                <TripMap
                  height={280}
                  markers={data.markets.map((m) => ({
                    lat: m.location.lat,
                    lng: m.location.lng,
                    title: `${m.name} (₹${m.net})`,
                  }))}
                />
              </View>
            )}

            {/* Three Pick Cards */}
            {data.picks.balanced && renderMarketCard(data.picks.balanced, 'BALANCED')}

            {data.picks.bestProfit &&
              data.picks.bestProfit.id !== data.picks.balanced?.id &&
              renderMarketCard(data.picks.bestProfit, 'BEST_PROFIT')}

            {data.picks.nearest &&
              data.picks.nearest.id !== data.picks.balanced?.id &&
              data.picks.nearest.id !== data.picks.bestProfit?.id &&
              renderMarketCard(data.picks.nearest, 'NEAREST')}

            {/* Other Markets */}
            {data.markets
              .filter(
                (m) =>
                  m.id !== data.picks.balanced?.id &&
                  m.id !== data.picks.bestProfit?.id &&
                  m.id !== data.picks.nearest?.id,
              )
              .map((m) => renderMarketCard(m))}

            {/* Footnote */}
            <View style={styles.footnoteBox}>
              <Txt variant="bodyMd" style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
                * Estimated loss, guaranteed shelf life nahi.
              </Txt>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space.md,
    gap: space.md,
  },
  loadingBox: {
    padding: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: space.xl,
    alignItems: 'center',
    textAlign: 'center',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
  },
  extraBanner: {
    padding: space.md,
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.sm,
    padding: 2,
  },
  toggleBtn: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
  },
  card: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    gap: space.sm,
  },
  recommendedCard: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.surfaceContainerHigh,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: space.xs,
  },
  breakdownBox: {
    backgroundColor: colors.surfaceContainerLow,
    padding: space.sm,
    borderRadius: radius.sm,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netRow: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    paddingTop: space.xs,
    marginTop: space.xs,
  },
  reasonBox: {
    backgroundColor: colors.surfaceContainerLowest,
    padding: space.sm,
    borderRadius: radius.sm,
  },
  warningsBox: {
    gap: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  demandBox: {
    backgroundColor: colors.surfaceContainerLowest,
    padding: space.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  demandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  footnoteBox: {
    paddingVertical: space.md,
    alignItems: 'center',
  },
});

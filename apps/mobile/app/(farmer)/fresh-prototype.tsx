/**
 * T00A review prototype. This route is intentionally not linked from the farmer
 * navigation and uses local simulated values only. Do not connect it to `api`.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  Banner,
  Button,
  Card,
  Field,
  Screen,
  StatusBadge,
  Txt,
} from '../../components/ui';
import { colors, layout, radius, space } from '../../theme';

type Flow = 'produce' | 'comparison' | 'recovery' | 'partial-sale';

const FLOW_TABS: Array<{ id: Flow; label: string; icon: keyof typeof MaterialIcons.glyphMap }> = [
  { id: 'produce', label: 'Crop details', icon: 'eco' },
  { id: 'comparison', label: 'Markets', icon: 'storefront' },
  { id: 'recovery', label: 'Recovery', icon: 'local-shipping' },
  { id: 'partial-sale', label: 'Partial sale', icon: 'inventory-2' },
];

const DELIVERY_WINDOWS = ['Today', '12 hours', '24 hours', '48 hours', 'Flexible'];
const RIPENESS = ['Green', 'Turning', 'Ripe'];
const STORAGE = ['Shaded', 'Ambient', 'Cool', 'Unknown'];

function DemoTag() {
  return (
    <View style={styles.demoTag} accessibilityLabel="Prototype only. All data is simulated.">
      <MaterialIcons name="science" size={15} color={colors.statusWarning} />
      <Txt variant="labelSm" color={colors.statusWarning}>PROTOTYPE · SIMULATED DATA</Txt>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Txt variant="labelLg" color={selected ? colors.onPrimaryContainer : colors.onSurfaceVariant}>
        {label}
      </Txt>
    </Pressable>
  );
}

function FlowTabs({ active, onSelect }: { active: Flow; onSelect: (flow: Flow) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
      accessibilityLabel="Prototype flow navigation"
    >
      {FLOW_TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <MaterialIcons
              name={tab.icon}
              size={18}
              color={selected ? colors.background : colors.onSurfaceVariant}
            />
            <Txt variant="labelSm" color={selected ? colors.background : colors.onSurfaceVariant}>
              {tab.label}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="headlineMd">{title}</Txt>
      {detail ? <Txt variant="bodyMd" color={colors.onSurfaceVariant}>{detail}</Txt> : null}
    </View>
  );
}

function OptionCard({
  label,
  market,
  details,
  featured = false,
  selected = false,
  onSelect,
  onDetails,
}: {
  label: string;
  market: string;
  details: string;
  featured?: boolean;
  selected?: boolean;
  onSelect: () => void;
  onDetails: () => void;
}) {
  return (
    <Card style={selected ? styles.featuredCard : undefined}>
      <View style={styles.rowBetween}>
        <Txt variant="labelLg" style={{ flex: 1 }}>{label}</Txt>
        {featured ? <StatusBadge status="CONFIRMED" label="Balanced pick" /> : selected ? <StatusBadge status="PENDING" label="Selected for review" /> : null}
      </View>
      <Txt variant="headlineMd" style={{ marginTop: space.sm }}>{market}</Txt>
      <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.xs }}>
        {details}
      </Txt>
      <Txt variant="labelSm" color={colors.statusWarning} style={{ marginTop: space.sm }}>
        SIMULATED ESTIMATE · NOT A BUYER OFFER
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
        <Button label="Select option" variant="secondary" onPress={onSelect} />
        <Button label="Location details" variant="ghost" onPress={onDetails} />
      </View>
    </Card>
  );
}

export default function FreshPrototype() {
  const [flow, setFlow] = useState<Flow>('produce');
  const [quantity, setQuantity] = useState('480');
  const [harvested, setHarvested] = useState('Today, 6:00 AM');
  const [ripeness, setRipeness] = useState('Turning');
  const [storage, setStorage] = useState('Shaded');
  const [delivery, setDelivery] = useState('12 hours');
  const [reported, setReported] = useState(false);
  const [farmerHandover, setFarmerHandover] = useState(false);
  const [driverHandover, setDriverHandover] = useState(false);
  const [handoverComplete, setHandoverComplete] = useState(false);
  const [saleQuantity, setSaleQuantity] = useState('180');
  const [decision, setDecision] = useState('REROUTE_TO_MARKET');
  const [farmerApproved, setFarmerApproved] = useState(false);
  const [transporterApproved, setTransporterApproved] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState('Pune Market Yard');
  const [marketView, setMarketView] = useState<'List' | 'Map'>('List');
  const [pickupIndex, setPickupIndex] = useState(0);
  const [incidentType, setIncidentType] = useState('Vehicle breakdown');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [dispositionMessage, setDispositionMessage] = useState('');
  const [reroutedKg, setReroutedKg] = useState(0);
  const [cargoMarket, setCargoMarket] = useState('Pune');

  const marketOptions = [
    { name: 'Pune Market Yard', label: 'Best balanced', details: '₹18,400 estimated net · 3h 20m · ₹2,100 transport · balanced score 82/100', coords: '18.4805, 73.8683' },
    { name: 'Vashi APMC', label: 'Highest net proceeds', details: '₹19,050 estimated net · 5h 10m · ₹3,500 transport', coords: '19.0662, 73.0021' },
    { name: 'Lasalgaon APMC', label: 'Fastest feasible', details: '₹17,800 estimated net · 1h 45m · ₹950 transport', coords: '20.1417, 74.2389' },
    { name: 'Ahmednagar APMC', label: 'Closest suitable', details: 'Reference location · estimated route and buyer data', coords: '19.0948, 74.7480' },
  ];
  const pickupOptions = ['Nashik, Maharashtra', 'Lasalgaon, Maharashtra', 'Sinnar, Maharashtra', 'Yeola, Maharashtra'];

  const remaining = Math.max(0, (Number(quantity) || 0) - (Number(saleQuantity) || 0) - reroutedKg);
  const bothApproved = farmerApproved && transporterApproved;
  const chooseDecision = (next: string) => {
    setDecision(next);
    setFarmerApproved(false);
    setTransporterApproved(false);
  };

  if (!__DEV__) {
    return (
      <Screen scroll={false}>
        <View style={{ paddingTop: space.xl }}>
          <Txt variant="headlineMd">Prototype unavailable</Txt>
          <Txt variant="bodyMd" color={colors.onSurfaceVariant}>
            This review screen is only available in development builds.
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logo}><MaterialIcons name="spa" size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Txt variant="labelSm" color={colors.onSurfaceVariant}>KISANPOOL FRESH</Txt>
              <Txt variant="headlineLg">Market & delivery preview</Txt>
            </View>
          </View>
          <DemoTag />
          <Txt variant="bodyMd" color={colors.onSurfaceVariant}>
            Review the crop, market comparison, vehicle recovery and partial-sale decisions.
          </Txt>
        </View>

        <FlowTabs active={flow} onSelect={setFlow} />

        {flow === 'produce' ? (
          <View>
            <SectionTitle title="Your harvest" detail="A few details help compare suitable delivery options." />
            <Banner tone="info">
              <Txt variant="labelLg">Prototype only</Txt>
              <Txt variant="bodyMd" style={{ marginTop: space.xs }}>
                Values stay on this screen. No request or booking is created.
              </Txt>
            </Banner>
            <Card>
              <Txt variant="labelLg" style={{ marginBottom: space.sm }}>Crop</Txt>
              <View style={styles.wrapChoices}>
                <Choice label="Tomato" selected onPress={() => {}} />
                <Choice label="Other crops · not configured" selected={false} disabled onPress={() => {}} />
              </View>
              <Field
                label="Quantity (kg)"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                accessibilityLabel="Simulated crop quantity in kilograms"
              />
              <Field
                label="Harvest date and time"
                value={harvested}
                onChangeText={setHarvested}
                accessibilityLabel="Harvest date and time, simulated"
              />
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={styles.labelGap}>Ripeness stage</Txt>
              <View style={styles.wrapChoices}>
                {RIPENESS.map((item) => (
                  <Choice key={item} label={item} selected={ripeness === item} onPress={() => setRipeness(item)} />
                ))}
              </View>
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={styles.labelGap}>Storage since harvest</Txt>
              <View style={styles.wrapChoices}>
                {STORAGE.map((item) => (
                  <Choice key={item} label={item} selected={storage === item} onPress={() => setStorage(item)} />
                ))}
              </View>
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={styles.labelGap}>Pickup location</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Change simulated pickup location" onPress={() => setPickupIndex((pickupIndex + 1) % pickupOptions.length)} style={styles.locationBox}>
                <MaterialIcons name="location-on" size={20} color={colors.onSurfaceVariant} />
                <View style={{ flex: 1 }}>
                  <Txt variant="labelLg">{pickupOptions[pickupIndex]}</Txt>
                  <Txt variant="labelSm" color={colors.onSurfaceVariant}>Tap to cycle simulated reference pickup</Txt>
                </View>
                <MaterialIcons name="edit" size={18} color={colors.onSurfaceVariant} />
              </Pressable>
              <Txt variant="labelLg" color={colors.onSurfaceVariant} style={styles.labelGap}>When would you like it delivered?</Txt>
              <View style={styles.wrapChoices}>
                {DELIVERY_WINDOWS.map((item) => (
                  <Choice key={item} label={item} selected={delivery === item} onPress={() => setDelivery(item)} />
                ))}
              </View>
            </Card>
            <Button
              label="Preview simulated market options"
              onPress={() => setFlow('comparison')}
              variant="primary"
              style={{ marginTop: space.sm }}
            />
          </View>
        ) : null}

        {flow === 'comparison' ? (
          <View>
            <SectionTitle title="Compare suitable markets" detail="Illustrative scenario · all prices and transport quotes are simulated." />
            <Banner tone="warning">
              <Txt variant="labelLg">Prices are not live</Txt>
              <Txt variant="bodyMd" style={{ marginTop: space.xs }}>
                Indicative sample data only. It is not a confirmed buyer offer or guaranteed return.
              </Txt>
            </Banner>
            <View style={styles.wrapChoices}>
              {(['List', 'Map'] as const).map(view => <Choice key={view} label={`${view} view`} selected={marketView === view} onPress={() => setMarketView(view)} />)}
            </View>
            {marketView === 'Map' ? <Card><Txt variant="labelLg">Reference locations · schematic</Txt>{marketOptions.map(m => <Txt key={m.name} variant="bodyMd" color={colors.onSurfaceVariant}>{m.name} · {m.coords}</Txt>)}</Card> : null}
            {marketOptions.map((option, index) => (
              <OptionCard key={option.name} featured={index === 0} selected={selectedMarket === option.name} label={option.label} market={option.name} details={option.details}
                onSelect={() => setSelectedMarket(option.name)}
                onDetails={() => Alert.alert(option.name, `${option.coords} · Maharashtra · simulated location and quote. No live market or buyer verification.`)} />
            ))}
            <Card>
              <Txt variant="labelLg">Why this option?</Txt>
              <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.sm }}>
                {selectedMarket} is selected. The example compares estimated proceeds with delivery fit. Actual price, route, vehicle availability and crop quality can differ.
              </Txt>
              <View style={styles.scoreGrid}>
                <Score label="Net proceeds" score="78" />
                <Score label="Delivery fit" score="86" />
                <Score label="Balanced score" score="82" />
              </View>
              <Txt variant="labelSm" color={colors.statusWarning} style={{ marginTop: space.sm }}>
                Tomato freshness model: unavailable in this prototype. No shelf-life estimate shown.
              </Txt>
              <Txt variant="labelSm" color={colors.onSurfaceVariant} style={{ marginTop: space.xs }}>Pickup reference: {pickupOptions[pickupIndex]} · chosen destination: {selectedMarket}</Txt>
            </Card>
            <Button label="Share safe comparison summary" variant="secondary" icon="share" onPress={() => void Share.share({ title: 'KisanPool Fresh prototype', message: `${quantity} kg tomatoes · ${selectedMarket} · simulated estimates only.` })} />
            <Button label="Back to crop details" variant="secondary" icon="arrow-back" onPress={() => setFlow('produce')} />
          </View>
        ) : null}

        {flow === 'recovery' ? (
          <View>
            <SectionTitle title="Vehicle breakdown recovery" detail="Example incident and replacement handover for one active delivery." />
            <Card>
              <View style={styles.rowBetween}>
                <Txt variant="headlineMd">Report an incident</Txt>
                <StatusBadge status={reported ? 'PENDING' : 'IN_TRANSIT'} label={reported ? 'Demo report saved' : 'Trip active'} />
              </View>
              <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.sm }}>
                Example trip · 300 kg tomatoes · 42 km from pickup
              </Txt>
              <View style={styles.wrapChoices}>
                {['Vehicle breakdown', 'Road blocked', 'Safety concern'].map(item => <Choice key={item} label={item} selected={incidentType === item} onPress={() => setIncidentType(item)} />)}
              </View>
              <Field label="What happened?" placeholder="Describe the issue" value={incidentDescription} onChangeText={setIncidentDescription} multiline numberOfLines={3} />
              <Button label={reported ? 'Demo incident recorded' : 'Record simulated incident'} variant="primary" disabled={!incidentDescription.trim()} onPress={() => { setReported(true); setFarmerHandover(false); setDriverHandover(false); setHandoverComplete(false); }} />
              <Txt variant="labelSm" color={colors.statusWarning} style={{ marginTop: space.sm }}>
                Demo action only · does not contact anyone or update a trip.
              </Txt>
            </Card>
            <SectionTitle title="Replacement and cargo handover" detail="Both parties confirm the same simulated transfer details." />
            <Card>
              <View style={styles.rowBetween}>
                <Txt variant="headlineMd">Replacement vehicle</Txt>
                <StatusBadge status="PENDING" label="Simulated match" />
              </View>
              <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.sm }}>
                Verified mini truck · 800 kg capacity · estimated arrival in 35 min
              </Txt>
              {!reported ? <Txt variant="labelSm" color={colors.statusWarning}>Record an incident before confirming a replacement handover.</Txt> : null}
              <View style={styles.metricBand}>
                <Metric label="Revised ETA" value="2:40 PM" />
                <Metric label="Remaining leg quote" value="₹740" />
                <Metric label="Cargo at handover" value="300 kg · good" />
              </View>
              <Txt variant="labelLg" style={{ marginTop: space.md }}>Handover acknowledgements</Txt>
              <ConfirmRow label="Farmer confirms quantity and condition" value={farmerHandover} disabled={!reported || handoverComplete} onChange={value => setFarmerHandover(value)} />
              <ConfirmRow label="Replacement driver confirms custody" value={driverHandover} disabled={!reported || handoverComplete} onChange={value => setDriverHandover(value)} />
              <Button label={handoverComplete ? 'Handover recorded' : 'Confirm simulated handover'} variant="primary" disabled={!reported || !farmerHandover || !driverHandover || handoverComplete} onPress={() => setHandoverComplete(true)} />
              <Banner tone={handoverComplete ? 'primary' : 'warning'} style={{ marginTop: space.sm }}>
                <Txt variant="bodyMd">
                  {handoverComplete
                    ? 'Both simulated acknowledgements match. Handover recorded in this screen only.'
                    : !reported
                      ? 'Record an incident before confirming a replacement handover.'
                      : farmerHandover && driverHandover
                        ? 'Both parties acknowledged. Confirm the handover to finish this demo step.'
                        : 'Recovery status: waiting for both custody confirmations.'}
                </Txt>
              </Banner>
            </Card>
          </View>
        ) : null}

        {flow === 'partial-sale' ? (
          <View>
            <SectionTitle title="Sell here or reroute?" detail="Compare options for the remaining cargo after a partial sale." />
            <Card>
              <View style={styles.rowBetween}>
                <Txt variant="headlineMd">Current market · {cargoMarket}</Txt>
                <StatusBadge status="IN_TRANSIT" label="At market" />
              </View>
              <View style={styles.metricBand}>
                <Metric label="Received" value={`${Number(quantity) || 0} kg`} />
                <Metric label="Already sold" value={`${Number(saleQuantity) || 0} kg`} />
                <Metric label="Remaining" value={`${remaining} kg`} />
                <Metric label="In transit" value={`${reroutedKg} kg`} />
              </View>
              <Field
                label="Quantity sold here (kg) · simulated"
                value={saleQuantity}
                onChangeText={value => { setSaleQuantity(value.replace(/[^0-9.]/g, '')); setFarmerApproved(false); setTransporterApproved(false); setDispositionMessage(''); }}
                keyboardType="numeric"
                accessibilityLabel="Simulated quantity sold in kilograms"
              />
            </Card>
            <Txt variant="labelLg" color={colors.onSurfaceVariant} style={styles.labelGap}>Choose an action for {remaining} kg remaining</Txt>
            <ActionChoice
              title="SELL_HERE"
              subtitle="Accept the current market's simulated offer · ₹24/kg"
              selected={decision === 'SELL_HERE'}
              onPress={() => chooseDecision('SELL_HERE')}
            />
            <ActionChoice
              title="REROUTE_TO_MARKET"
              subtitle="Send remaining cargo to Vashi · ₹760 new leg quote · 3h 50m"
              selected={decision === 'REROUTE_TO_MARKET'}
              onPress={() => chooseDecision('REROUTE_TO_MARKET')}
            />
            <ActionChoice
              title="HOLD_OR_ESCALATE"
              subtitle="Pause the decision and ask operations for help"
              selected={decision === 'HOLD_OR_ESCALATE'}
              onPress={() => chooseDecision('HOLD_OR_ESCALATE')}
            />
            <Card>
              <View style={styles.rowBetween}>
                <Txt variant="headlineMd">Confirm this option</Txt>
                <StatusBadge status="PENDING" label="Quote v7 · simulated" />
              </View>
              <Txt variant="bodyMd" color={colors.onSurfaceVariant} style={{ marginTop: space.sm }}>
                Both approvals must refer to this same option and quote version. A changed quote clears approvals.
              </Txt>
              <ConfirmRow label="Farmer approves commercial choice" value={farmerApproved} onChange={setFarmerApproved} />
              <ConfirmRow label="Transporter confirms route and quote" value={transporterApproved} onChange={setTransporterApproved} />
              <Button label="Confirm simulated disposition" variant="primary" disabled={!bothApproved || remaining <= 0} onPress={() => {
                const amount = remaining;
                const action = decision === 'SELL_HERE' ? `Sold remaining ${amount} kg at current market.` : decision === 'REROUTE_TO_MARKET' ? `Dispatched remaining ${amount} kg on a simulated next leg to Vashi.` : `Escalated ${amount} kg to operations; cargo remains in custody.`;
                setDispositionMessage(`${action} Both approvals cleared for the next decision.`);
                if (decision === 'SELL_HERE') setSaleQuantity(String((Number(quantity) || 0) - reroutedKg));
                if (decision === 'REROUTE_TO_MARKET') setReroutedKg(value => value + amount);
                setFarmerApproved(false); setTransporterApproved(false);
              }} />
              {dispositionMessage ? <Txt variant="bodyMd" color={colors.primary} style={{ marginTop: space.sm }}>{dispositionMessage}</Txt> : null}
              <Banner tone={bothApproved ? 'primary' : 'warning'} style={{ marginTop: space.sm }}>
                <Txt variant="bodyMd">
                  {bothApproved
                    ? `${decision}: both parties approved simulated quote v7. This does not execute a reroute.`
                    : 'Waiting for both parties to approve the same current option and quote.'}
                </Txt>
              </Banner>
            </Card>
            <Txt variant="labelSm" color={colors.statusWarning}>
              All quantities, offers and quotes on this screen are simulated examples.
            </Txt>
            {reroutedKg > 0 ? <Button label={`Simulate arrival at Vashi (${reroutedKg} kg)`} icon="where-to-vote" variant="secondary" onPress={() => { setCargoMarket('Vashi'); setReroutedKg(0); setDispositionMessage('Cargo received in the simulated example and is available for another decision.'); }} style={{ marginTop: space.sm }} /> : null}
          </View>
        ) : null}

        <View style={styles.footerNote}>
          <MaterialIcons name="visibility" size={18} color={colors.onSurfaceVariant} />
          <Txt variant="labelSm" color={colors.onSurfaceVariant} style={{ flex: 1 }}>
            Internal review preview · not a live Fresh Produce feature
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Score({ label, score }: { label: string; score: string }) {
  return (
    <View style={styles.score}>
      <Txt variant="headlineMd">{score}</Txt>
      <Txt variant="labelSm" color={colors.onSurfaceVariant}>{label}</Txt>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Txt variant="labelSm" color={colors.onSurfaceVariant}>{label}</Txt>
      <Txt variant="labelLg">{value}</Txt>
    </View>
  );
}

function ConfirmRow({ label, value, onChange, disabled = false }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      disabled={disabled}
      style={styles.confirmRow}
    >
      <MaterialIcons
        name={value ? 'check-box' : 'check-box-outline-blank'}
        size={22}
        color={value ? colors.primary : colors.onSurfaceVariant}
      />
      <Txt variant="bodyMd" style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  );
}

function ActionChoice({ title, subtitle, selected, onPress }: { title: string; subtitle: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${title}: ${subtitle}`}
      accessibilityState={{ selected }}
      style={[styles.actionChoice, selected && styles.actionChoiceSelected]}
    >
      <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={selected ? colors.primary : colors.onSurfaceVariant} />
      <View style={{ flex: 1 }}>
        <Txt variant="labelLg">{title}</Txt>
        <Txt variant="bodyMd" color={colors.onSurfaceVariant}>{subtitle}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.edgeMargin, paddingTop: space.md, paddingBottom: space.xl },
  header: { gap: space.sm, marginBottom: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.gutter },
  logo: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.surfaceContainerHigh },
  demoTag: { minHeight: 32, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space.xs, borderRadius: radius.full, paddingHorizontal: space.sm, backgroundColor: colors.warningContainer },
  tabs: { gap: space.sm, paddingVertical: space.sm },
  tab: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.full, paddingHorizontal: space.md },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  sectionTitle: { gap: space.xs, marginTop: space.md, marginBottom: space.md },
  wrapChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  choice: { minHeight: layout.minTouchTarget, justifyContent: 'center', borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.base, backgroundColor: colors.surfaceContainerLowest, paddingHorizontal: space.md },
  choiceSelected: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  labelGap: { marginBottom: space.sm },
  locationBox: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.base, paddingHorizontal: space.gutter, marginBottom: space.md },
  featuredCard: { borderColor: colors.primary, borderWidth: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  col: { flex: 1, minWidth: 220 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  score: { flexGrow: 1, minWidth: 90, gap: space.xs, padding: space.sm, borderRadius: radius.base, backgroundColor: colors.surfaceContainerLow },
  metricBand: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, marginBottom: space.md },
  metric: { flexGrow: 1, minWidth: 92, gap: space.xs, padding: space.sm, borderRadius: radius.base, backgroundColor: colors.surfaceContainerLow },
  confirmRow: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  actionChoice: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm },
  actionChoiceSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceContainerLow },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant, paddingTop: space.md, marginTop: space.lg },
});

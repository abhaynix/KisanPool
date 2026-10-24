/** Idempotently refresh demo-only Fresh snapshots for seeded farmer accounts. */
import { connectDb, disconnectDb } from './db';
import { config } from './config';
import { FreshBuyerOffer, FreshDeliveryOutcome, FreshRecommendation, TripShipment, TransportRequest, User } from './models';
import { createFreshRecommendation } from './modules/fresh/service';

const DEMO_KEY = 'fresh-demo-v1';
const DEMO_FARMERS = ['9000000001', '9000000006', '9000000007'];
const RUN_DAYS = 7;

async function seedFarmer(phone: string) {
  const farmer = await User.findOne({ phone, role: 'FARMER' });
  if (!farmer) throw new Error(`Demo farmer ${phone} is missing. Run "npm run seed" first.`);
  if (!farmer.defaultLocation) throw new Error(`Demo farmer ${phone} has no seeded pickup location.`);
  const lat = farmer.defaultLocation.lat;
  const lng = farmer.defaultLocation.lng;
  if (lat == null || lng == null) throw new Error(`Demo farmer ${phone} has an incomplete pickup location.`);
  const pickup = { name: farmer.defaultLocation.name || 'Demo farm', lat, lng };

  const oldSnapshots = await FreshRecommendation.find({ farmerId: farmer._id, 'input.demoScenarioKey': DEMO_KEY }, '_id');
  for (const old of oldSnapshots) {
    const linkedRequest = await TransportRequest.exists({ freshRecommendationId: old._id });
    if (linkedRequest) continue;
    await FreshBuyerOffer.deleteMany({ farmerId: farmer._id, recommendationId: old._id });
    await FreshRecommendation.deleteOne({ _id: old._id });
  }

  const now = new Date();
  const snapshot = await createFreshRecommendation(String(farmer._id), {
    cropKey: 'tomato',
    quantityKg: 480,
    harvestedAt: new Date(now.getTime() - 3 * 60 * 60_000),
    ripenessStage: 'TURNING',
    storageCondition: 'SHADE',
    handlingCondition: 'GOOD',
    pickup,
    earliestPickupAt: new Date(now.getTime() + 2 * 60_000),
    desiredArrivalBy: new Date(now.getTime() + 12 * 60 * 60_000),
    searchRadiusKm: 100,
  });
  await FreshRecommendation.updateOne(
    { _id: snapshot._id },
    { $set: { 'input.demoScenarioKey': DEMO_KEY } },
  );

  await FreshBuyerOffer.create({
    farmerId: farmer._id,
    recommendationId: snapshot._id,
    marketName: 'Lasalgaon APMC',
    buyerLabel: 'Demo buyer quote · not verified',
    priceINRPerKg: 16.5,
    quantityKg: 300,
    validUntil: new Date(now.getTime() + RUN_DAYS * 24 * 60 * 60_000),
    evidenceStatus: 'FARMER_REPORTED_UNVERIFIED',
  });

  return { farmer, snapshot };
}

async function main() {
  if (!config.freshDemoData) {
    throw new Error('Fresh demo fixtures are disabled. Set FRESH_DEMO_DATA=true in local .env; production always ignores this flag.');
  }
  await connectDb();
  try {
    const seeded = [];
    for (const phone of DEMO_FARMERS) seeded.push(await seedFarmer(phone));

    const { farmer, snapshot } = seeded[0];
    const shipment = await TripShipment.findOne({ farmerId: farmer._id, cropType: 'Tomato', state: 'COMPLETED' }).sort({ deliveredAt: -1 });
    if (shipment) {
      const request = await TransportRequest.findById(shipment.requestId);
      if (request && shipment.tripId && shipment.pickedUpAt && shipment.deliveredAt) {
        await FreshDeliveryOutcome.findOneAndUpdate(
          { requestId: request._id },
          {
            farmerId: farmer._id,
            requestId: request._id,
            tripId: shipment.tripId,
            shipmentId: shipment._id,
            recommendationId: snapshot._id,
            expectedSoldPriceINRPerKg: 16.5,
            expectedSaleableKg: 460,
            expectedTransportCostINR: shipment.finalPrice ?? shipment.allocatedPrice,
            actualPickupAt: shipment.pickedUpAt,
            actualDeliveredAt: shipment.deliveredAt,
            actualSoldPriceINRPerKg: 15.75,
            acceptedKg: Math.max(0, shipment.quantityKg - 20),
            rejectedKg: Math.min(20, shipment.quantityKg),
            additionalCostsINR: 150,
            qualityOutcome: 'PARTIAL_REJECTION',
            evidenceSource: 'FARMER_REPORTED',
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      }
    }

    console.log(`Seeded ${seeded.length} Fresh comparison snapshots and unverified buyer quotes.`);
    console.log('Snapshots remain non-bookable while market price/acceptance evidence is unverified.');
    console.log('Use the local farmer account and “Open seeded demo comparison” on Fresh Produce options.');
    console.log(`Linked farmer-reported outcome fixture: ${shipment ? 'present' : 'no completed tomato shipment found; run npm run seed first'}.`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

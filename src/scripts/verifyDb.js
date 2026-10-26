import { connectDB, disconnectDB } from '../config/db.js';
import {
  Workspace,
  User,
  Customer,
  Product,
  Order,
} from '../models/index.js';

const verify = async () => {
  console.log('🔍 Running Phase 2 Database & Models Verification...\n');
  await connectDB();

  let allPassed = true;

  try {
    // Test 1: Workspace Lookup
    const workspace = await Workspace.findOne({ slug: 'acme-retail' });
    if (!workspace) throw new Error('Workspace not found');
    console.log(`✅ [1/6] Workspace verified: ${workspace.name} (Currency: ${workspace.currency})`);

    // Test 2: User Password Hashing and comparePassword Method
    const admin = await User.findOne({ email: 'admin@insightboard.io' });
    if (!admin) throw new Error('Admin user not found');
    const isCorrect = await admin.comparePassword('password123');
    const isIncorrect = await admin.comparePassword('wrongpassword');
    if (!isCorrect || isIncorrect) throw new Error('Password comparison method failed');
    console.log(`✅ [2/6] User bcrypt password comparison verified (Correct: ${isCorrect}, Wrong: ${!isIncorrect})`);

    // Test 3: toJSON removes passwordHash
    const serializedUser = admin.toJSON();
    if (serializedUser.passwordHash) throw new Error('passwordHash was not stripped by toJSON');
    console.log(`✅ [3/6] User toJSON security strip verified (passwordHash absent: ${!serializedUser.passwordHash})`);

    // Test 4: Product Unique SKU per Workspace Constraint
    let caughtDuplicate = false;
    try {
      await Product.create({
        name: 'Duplicate SKU Item',
        sku: 'SKU-AUDIO-001', // Existing SKU
        category: 'Audio',
        unitPricePaise: 50000,
        workspaceId: workspace._id,
      });
    } catch (err) {
      if (err.code === 11000) {
        caughtDuplicate = true;
      }
    }
    if (!caughtDuplicate) throw new Error('Unique compound index on (workspaceId, sku) failed to catch duplicate');
    console.log('✅ [4/6] Product unique compound index { workspaceId: 1, sku: 1 } properly rejected duplicate SKU');

    // Test 5: Customer Workspace-scoped Active Listing
    const activeCustomers = await Customer.find({
      workspaceId: workspace._id,
      isArchived: false,
    }).countDocuments();
    if (activeCustomers < 1) throw new Error('No active customers found');
    console.log(`✅ [5/6] Customer workspace-scoped query verified (${activeCustomers} active customers)`);

    // Test 6: Order Aggregation Pipeline
    const [analyticsResult] = await Order.aggregate([
      {
        $match: {
          workspaceId: workspace._id,
          status: 'paid',
        },
      },
      {
        $group: {
          _id: null,
          totalPaidRevenuePaise: { $sum: '$totalAmountPaise' },
          paidOrderCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          totalPaidRevenuePaise: 1,
          paidOrderCount: 1,
          avgOrderValuePaise: {
            $round: [{ $divide: ['$totalPaidRevenuePaise', '$paidOrderCount'] }, 0],
          },
        },
      },
    ]);

    if (!analyticsResult || analyticsResult.paidOrderCount === 0) {
      throw new Error('Aggregation pipeline returned no paid orders');
    }

    console.log(
      `✅ [6/6] Order aggregation pipeline verified:` +
      ` Paid Orders: ${analyticsResult.paidOrderCount},` +
      ` Total Revenue: ₹${(analyticsResult.totalPaidRevenuePaise / 100).toLocaleString('en-IN')},` +
      ` AOV: ₹${(analyticsResult.avgOrderValuePaise / 100).toLocaleString('en-IN')}`
    );

    console.log('\n🎉 ALL 6 DATABASE & MODEL VERIFICATION CHECKS PASSED!\n');
  } catch (err) {
    allPassed = false;
    console.error('❌ Verification failed:', err.message);
  } finally {
    await disconnectDB();
    process.exit(allPassed ? 0 : 1);
  }
};

verify();

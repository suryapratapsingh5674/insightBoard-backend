import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../config/db.js';
import {
  Workspace,
  User,
  Customer,
  Product,
  Order,
  Session,
} from '../models/index.js';

const seedDatabase = async () => {
  console.log('🌱 Starting InsightBoard Database Seeding...');
  await connectDB();

  try {
    // 1. Clear existing collections to make seed script idempotent and repeatable
    console.log('🧹 Purging existing demo data...');
    await Promise.all([
      Workspace.deleteMany({}),
      User.deleteMany({}),
      Session.deleteMany({}),
      Customer.deleteMany({}),
      Product.deleteMany({}),
      Order.deleteMany({}),
    ]);
    console.log('✨ Database cleared successfully.');

    // 2. Create Primary Demo Workspace
    const workspace = await Workspace.create({
      name: 'Acme Retail Corp',
      slug: 'acme-retail',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
    });
    console.log(`🏢 Workspace created: "${workspace.name}" (${workspace._id})`);

    // 3. Hash passwords for demo accounts
    const saltRounds = 10;
    const defaultPassword = 'password123';
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    // 4. Create Demo Users (Admin, Analyst, Viewer)
    const users = await User.insertMany([
      {
        name: 'Alex Rivera',
        email: 'admin@insightboard.io',
        passwordHash,
        role: 'Admin',
        workspaceId: workspace._id,
        isActive: true,
      },
      {
        name: 'Priya Sharma',
        email: 'analyst@insightboard.io',
        passwordHash,
        role: 'Analyst',
        workspaceId: workspace._id,
        isActive: true,
      },
      {
        name: 'David Kim',
        email: 'viewer@insightboard.io',
        passwordHash,
        role: 'Viewer',
        workspaceId: workspace._id,
        isActive: true,
      },
    ]);
    console.log(`👥 Created ${users.length} demo team accounts (Admin, Analyst, Viewer)`);

    const adminUser = users.find((u) => u.role === 'Admin');

    // 5. Create Demo Customers
    const customersData = [
      { name: 'Oliver John Brown', email: 'oliver.brown@northwind.com', company: 'Northwind Traders', phone: '+91 98765 43210' },
      { name: 'Noah James Smith', email: 'noah.smith@apexstudio.io', company: 'Apex Design Studio', phone: '+91 98123 45678' },
      { name: 'Sophia Patel', email: 'sophia@biohealth.org', company: 'BioHealth Labs', phone: '+91 99887 76655' },
      { name: 'Ethan Walker', email: 'ethan@horizonlogistics.in', company: 'Horizon Logistics', phone: '+91 98450 11223' },
      { name: 'Aarav Mehta', email: 'aarav.mehta@zenithenterprises.com', company: 'Zenith Enterprises', phone: '+91 97654 32109' },
      { name: 'Ananya Roy', email: 'ananya@cloudnative.tech', company: 'CloudNative Solutions', phone: '+91 99345 67890' },
      { name: 'Vikram Malhotra', email: 'vikram.m@malhotratex.com', company: 'Malhotra Textiles Ltd', phone: '+91 98221 54321' },
      { name: 'Tara Deshmukh', email: 'tara@greenrootsorganic.com', company: 'GreenRoots Organic', phone: '+91 98112 33445' },
      { name: 'Rohan Gupta', email: 'rohan.g@guptahardware.in', company: 'Gupta Hardware & Tools', phone: '+91 98770 99887' },
      { name: 'Meera Iyer', email: 'meera.iyer@iyercounsel.com', company: 'Iyer & Associates', phone: '+91 99001 22334' },
      { name: 'Kabir Verma', email: 'kabir@vermadigital.io', company: 'Verma Digital Media', phone: '+91 98555 44332' },
      { name: 'Zoya Khan', email: 'zoya@starlightcafe.com', company: 'Starlight Hospitality', phone: '+91 98333 22110' },
    ];

    const customers = await Customer.insertMany(
      customersData.map((cust, idx) => {
        // Stagger customer creation dates across past 4 months
        const createdDaysAgo = Math.floor(idx * 9) + 2;
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - createdDaysAgo);

        return {
          ...cust,
          workspaceId: workspace._id,
          isArchived: false,
          createdAt,
          updatedAt: createdAt,
        };
      })
    );
    console.log(`👤 Created ${customers.length} realistic customer profiles`);

    // 6. Create Demo Products (with unitPrice in integer paise)
    const productsData = [
      { name: 'Wireless Noise-Canceling Headphones', sku: 'SKU-AUDIO-001', category: 'Audio', unitPricePaise: 1499900 }, // ₹14,999
      { name: 'Mechanical Ergonomic Keyboard RGB', sku: 'SKU-ELEC-002', category: 'Electronics', unitPricePaise: 849900 },    // ₹8,499
      { name: 'Designer Laptop Backpack 20L', sku: 'SKU-ACC-003', category: 'Accessories', unitPricePaise: 420000 },         // ₹4,200
      { name: 'Ultra-Wide 34-inch Curved Monitor', sku: 'SKU-DISP-004', category: 'Electronics', unitPricePaise: 4599900 },   // ₹45,999
      { name: 'Smart Fitness Tracker Pro', sku: 'SKU-WEAR-005', category: 'Wearables', unitPricePaise: 649900 },             // ₹6,499
      { name: 'Aluminum Laptop Riser Stand', sku: 'SKU-ACC-006', category: 'Accessories', unitPricePaise: 249900 },          // ₹2,499
      { name: 'USB-C Multi-Port Hub (8-in-1)', sku: 'SKU-ELEC-007', category: 'Electronics', unitPricePaise: 389900 },       // ₹3,899
      { name: 'Precision Wireless Mouse (Silent)', sku: 'SKU-ELEC-008', category: 'Electronics', unitPricePaise: 299900 },     // ₹2,999
      { name: 'Studio Desk Condenser Microphone', sku: 'SKU-AUDIO-009', category: 'Audio', unitPricePaise: 920000 },         // ₹9,200
      { name: 'Leather Executive Desk Pad Mat', sku: 'SKU-FURN-010', category: 'Furniture', unitPricePaise: 189900 },        // ₹1,899
    ];

    const products = await Product.insertMany(
      productsData.map((p) => ({
        ...p,
        workspaceId: workspace._id,
        isArchived: false,
      }))
    );
    console.log(`📦 Created ${products.length} product catalog items`);

    // 7. Generate 50 realistic Orders across the last 90 days
    const statuses = ['paid', 'paid', 'paid', 'paid', 'pending', 'cancelled']; // 66% paid, 17% pending, 17% cancelled
    const ordersToInsert = [];

    // Base sequence number
    let orderSeq = 878900;

    for (let i = 0; i < 50; i++) {
      const orderNumber = `ORD-${orderSeq + i}`;
      const customer = customers[i % customers.length];
      const status = statuses[i % statuses.length];

      // Pick 1 to 3 items per order
      const itemCount = (i % 3) + 1;
      const orderItems = [];
      let totalAmountPaise = 0;

      for (let j = 0; j < itemCount; j++) {
        const prod = products[(i + j * 3) % products.length];
        const quantity = (j % 2) + 1;
        const subtotalPaise = prod.unitPricePaise * quantity;

        orderItems.push({
          productId: prod._id,
          productName: prod.name,
          sku: prod.sku,
          unitPricePaise: prod.unitPricePaise,
          quantity,
          subtotalPaise,
        });

        totalAmountPaise += subtotalPaise;
      }

      // Distribute creation date across past 90 days
      // Recent orders are closer to today (i = 49 is today, i = 0 is 85 days ago)
      const daysAgo = Math.max(0, Math.floor((49 - i) * 1.8));
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - daysAgo);
      orderDate.setHours(9 + (i % 10), (i * 13) % 60, 0, 0);

      ordersToInsert.push({
        orderNumber,
        customerId: customer._id,
        items: orderItems,
        totalAmountPaise,
        status,
        workspaceId: workspace._id,
        createdBy: adminUser._id,
        createdAt: orderDate,
        updatedAt: orderDate,
      });
    }

    const insertedOrders = await Order.insertMany(ordersToInsert);
    console.log(`🛒 Created ${insertedOrders.length} synthetic orders spanning the past 90 days`);

    // 8. Tally and log key metrics for validation
    const paidOrders = insertedOrders.filter((o) => o.status === 'paid');
    const totalPaidPaise = paidOrders.reduce((sum, o) => sum + o.totalAmountPaise, 0);
    const avgOrderValuePaise = Math.round(totalPaidPaise / paidOrders.length);

    console.log('\n=========================================');
    console.log('✅ SEEDING COMPLETED SUCCESSFULLY!');
    console.log('=========================================');
    console.log(`Workspace:            ${workspace.name} (Slug: ${workspace.slug})`);
    console.log(`Team Users:           ${users.length}`);
    console.log(`- Admin:              admin@insightboard.io (Password: ${defaultPassword})`);
    console.log(`- Analyst:            analyst@insightboard.io (Password: ${defaultPassword})`);
    console.log(`- Viewer:             viewer@insightboard.io (Password: ${defaultPassword})`);
    console.log(`Customers:            ${customers.length}`);
    console.log(`Products:             ${products.length}`);
    console.log(`Total Orders:         ${insertedOrders.length}`);
    console.log(`Paid Orders:          ${paidOrders.length}`);
    console.log(`Paid Revenue (Gross): ₹${(totalPaidPaise / 100).toLocaleString('en-IN')}`);
    console.log(`Avg Order Value:      ₹${(avgOrderValuePaise / 100).toLocaleString('en-IN')}`);
    console.log('=========================================\n');
  } catch (error) {
    console.error('❌ Seeding failed with error:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
};

seedDatabase();

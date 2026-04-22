# Stone Henge v2

## Multi-Tenant SaaS Platform for Stone Masons

Stone Henge v2 is a complete rebuild of the original Stone Henge application, designed from the ground up as a multi-tenant SaaS platform for stone fabrication businesses.

---

## 🏗️ Architecture Overview

### Multi-Tenant Design
- **Tenant Isolation**: Each stone mason company operates in complete isolation
- **Customizable Pricing**: Each tenant configures their own pricing strategies
- **White-Label Support**: Enterprise customers can use their own branding

### SaaS Subscription Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Starter** | $79/mo | 3 users, 50 quotes/mo, basic features |
| **Professional** | $199/mo | 10 users, unlimited quotes, unit blocks, visual tool |
| **Enterprise** | $499/mo | Unlimited users, all integrations, custom domain |
| **White Label** | $999/mo | Full branding control, dedicated support |

---

## 🎯 Key Features

### Flexible Pricing Strategies

Each stone mason can configure their own pricing:

**Material Pricing:**
- `PER_SQUARE_METER_USED` - Charge only for material used
- `PER_SQUARE_METER_WITH_WASTAGE` - Charge for material + wastage
- `PER_WHOLE_SLAB` - Charge full slab price regardless of usage
- `PER_WHOLE_SLAB_WITH_REMNANT_CREDIT` - Full slab with remnant credits

**Service Units:**
- Cutting: Lineal meters, square meters, or per piece
- Polishing: Lineal meters, square meters, or per piece
- Installation: Square meters, lineal meters, per piece, or hourly
- Templating: Fixed, per km, or per square meter
- Delivery: Fixed zone, per km, or weight-based

### Unit Block Development Support

Built-in support for large multi-unit projects:
- Project hierarchy (Project → Buildings → Floors → Units)
- Volume-based pricing tiers
- Phased delivery scheduling
- Consolidated or per-unit billing
- Material optimization across all units

### Visual Layout Tool

Interactive canvas-based slab visualizer:
- Drag-and-drop piece placement
- Real-time waste calculation
- Quality zone marking (A/B/C/D)
- Auto-optimization algorithm
- Export to PDF/CAD

---

## 📁 Project Structure

```
stonehenge-v2/
├── src/
│   ├── lib/
│   │   ├── calculators/          # Modular pricing calculators
│   │   │   ├── index.ts          # Main calculator facade
│   │   │   ├── types.ts          # Calculator type definitions
│   │   │   ├── material-calculator-enhanced.ts
│   │   │   ├── edge-calculator.ts
│   │   │   ├── service-calculator-flexible.ts
│   │   │   └── unit-block-calculator.ts
│   │   ├── saas/
│   │   │   └── subscription.ts   # SaaS subscription management
│   │   └── ...
│   ├── components/
│   │   └── visual-layout/        # Visual layout tool
│   │       ├── VisualLayoutTool.tsx
│   │       ├── SlabCanvas.tsx
│   │       ├── LayoutToolbar.tsx
│   │       └── ...
│   └── ...
├── REFACTORING_PLAN.md           # Detailed architecture plan
└── README.md                     # This file
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional, for caching)

### Installation

```bash
# Clone the repository
git clone https://github.com/Cangaroo007/stonehenge-v2.git
cd stonehenge-v2

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

---

## 💰 SaaS Configuration

### Setting Up Subscription Plans

Edit `src/lib/saas/subscription.ts` to customize plans:

```typescript
export const SAAS_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  STARTER: { ... },
  PROFESSIONAL: { ... },
  // Add your custom plans here
};
```

### Company Pricing Configuration

Each company can configure their pricing through the admin panel:

```typescript
interface CompanyPricingConfig {
  materialPricingStrategy: MaterialPricingStrategy;
  serviceUnits: ServiceUnitConfig;
  wastageConfig: WastageConfig;
  pricingOptions: PricingOptions;
}
```

---

## 🔧 Development

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
```

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name your_migration_name

# Deploy migrations
npm run db:migrate
```

---

## 📊 Performance

### Target Metrics

| Metric | Target |
|--------|--------|
| Quote calculation time (50 pieces) | <500ms |
| Visual tool initialization | <2s |
| Unit block calculation (100 units) | <5s |
| API response time (p95) | <200ms |

### Caching Strategy

- **L1**: In-memory request cache
- **L2**: Redis shared cache
- **L3**: Materialized database views

---

## 🛣️ Roadmap

### Phase 1: Foundation (Current)
- ✅ Modular calculator architecture
- ✅ SaaS subscription system
- ✅ Company pricing configuration
- ✅ Basic visual layout tool

### Phase 2: Enhancement (Next)
- [ ] Advanced visual layout (quality zones, remnant tracking)
- [ ] Production scheduling integration
- [ ] Mobile app for field measurements
- [ ] Customer portal enhancements

### Phase 3: Scale (Future)
- [ ] AI-powered slab optimization
- [ ] Marketplace for remnant trading
- [ ] Multi-language support
- [ ] International tax handling

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 📞 Support

- **Documentation**: [docs.stonehenge.com](https://docs.stonehenge.com)
- **Support Email**: support@stonehenge.com
- **Enterprise Support**: enterprise@stonehenge.com

---

Built with ❤️ for stone masons everywhere.
# Preview env test Wed Apr 22 10:28:15 PDT 2026

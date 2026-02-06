# Stone Henge MVP

Quote generation system for stone countertop fabrication.

<!-- Deployment trigger: Database migrations cleaned, ready to deploy -->

## Prerequisites

- Node.js 18+ (https://nodejs.org)
- Docker Desktop (https://docker.com/products/docker-desktop)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# 3. Start PostgreSQL with Docker
docker-compose up -d

# 4. Run database migrations
npx prisma migrate dev

# 5. Seed the database (optional)
npm run seed

# 6. Start the development server
npm run dev
```

Visit http://localhost:3000

## Production Deployment

The app auto-deploys to Railway from the `main` branch.

- **Database**: PostgreSQL on Railway
- **Storage**: Cloudflare R2
- **URL**: https://stonehenge-production.up.railway.app

## Key Features

- AI-powered drawing analysis
- Real-time quote calculation
- Slab optimization
- PDF quote generation
- Customer portal
- Role-based permissions

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: Cloudflare R2
- **AI**: Anthropic Claude (vision API)
- **Deployment**: Railway

## Environment Variables

See `.env.example` for required configuration.

## Support

For issues or questions, contact the development team.

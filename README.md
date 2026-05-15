# Fellowship AI Demo

A powerlifting-focused workout logger that helps lifters track training, estimate strength progress, compare lifts against benchmarks, and generate AI-powered coaching advice.

## Overview

This app lets users create an athlete profile, log squat/bench/deadlift sets, calculate estimated 1RMs, and view training stats. Workouts can be entered manually or logged from voice using OpenAI transcription. The app also supports OpenPowerlifting benchmark imports, allowing lifters to compare their numbers against real competitive percentile data by sex, age, and bodyweight.

## Features

- Google sign-in with NextAuth
- Athlete profile with age, gender, bodyweight, goals, and 1RM values
- Manual workout logging for squat, bench, and deadlift
- Voice-based workout logging using OpenAI Whisper
- Estimated 1RM calculation
- Session stats and recent workout history
- AI-generated coaching advice
- OpenPowerlifting percentile benchmark import
- Local SQLite database using Drizzle ORM

## Tech Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- NextAuth
- Drizzle ORM
- SQLite / better-sqlite3
- OpenAI API
- OpenPowerlifting data

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Add the required environment variables:

```bash
OPENAI_API_KEY=your-openai-api-key
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Run the development server:

```bash
pnpm dev
```

Open `http://localhost:3000` in your browser.

## OpenPowerlifting Data

To import OpenPowerlifting benchmark data:

```bash
pnpm import:opl
```

This downloads the OpenPowerlifting CSV, processes squat/bench/deadlift results, and stores percentile benchmarks in the local SQLite database.

## Deployment

The project is deployed on DigitalOcean as a Node.js Next.js application. The production environment stores the required secrets in DigitalOcean environment variables, including the OpenAI key, NextAuth settings, and Google OAuth credentials.

The deployment flow is:

```bash
pnpm install
pnpm build
pnpm start
```

Because the app currently uses SQLite through `better-sqlite3`, the deployed instance needs persistent storage for the `data/lifting.db` file. For a larger production version, the database would likely move to a hosted SQL provider such as PostgreSQL or Turso.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm import:opl
```
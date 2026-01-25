import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

type RawRow = string[];

type NormalizedProduct = {
  id: string;
  createData: {
    name: string;
    category: string;
    subcategory: string;
    upc: string;
    size: string;
    pack: string;
    cost: number;
    price: number;
    stock: number;
    inStock: boolean;
    image: string;
    key: string;
  };
  updateData: {
    cost: number;
    price: number;
    stock: number;
    inStock: boolean;
  };
};

const REQUIRED_HEADERS = [
  "ITEMNAME",
  "DEPNAME",
  "MAINUPC",
  "SIZENAME",
  "PACKNAME",
  "CURRENTCOST",
  "PRICEPERUNIT",
  "TOTALQTY",
];

function loadEnvFromFile(fileName: string) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t");
    process.env[key] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  let limit: number | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--limit") {
      const next = args[i + 1];
      if (next) {
        const parsed = Number.parseInt(next, 10);
        if (!Number.isNaN(parsed)) limit = parsed;
      }
    } else if (arg.startsWith("--limit=")) {
      const value = arg.split("=")[1];
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) limit = parsed;
    }
  }

  return { dryRun, limit };
}

function parseCsv(content: string): RawRow[] {
  const rows: RawRow[] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const normalized = content.replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        const next = normalized[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      current.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

function getDatabaseId() {
  const raw = process.env.FIREBASE_DATABASE_ID;
  if (!raw) return "(default)";
  if (raw === "default") return "(default)";
  return raw;
}

let adminApp: App | null = getApps().length ? getApps()[0] : null;

function getAdminApp() {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set.");
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeCategory(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const known: Record<string, string> = {
    beer: "Beer",
    wine: "Wine",
    whiskey: "Whiskey",
    whisky: "Whiskey",
    vodka: "Vodka",
    tequila: "Tequila",
    rum: "Rum",
    gin: "Gin",
    extras: "Extras",
  };

  if (known[lower]) return known[lower];

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function normalizeUpc(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.0+)?$/.test(trimmed)) {
    return trimmed.replace(/\.0+$/, "");
  }
  return trimmed;
}

function parseNumber(value: string) {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string) {
  const cleaned = value.replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveCsvPath() {
  const candidates = [
    path.join(process.cwd(), "scripts", "data", "CategorizedItemList.csv"),
    path.join(process.cwd(), "scripts", "data", "CategorizedItemlist.csv"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("CSV file not found in scripts/data. Expected CategorizedItemList.csv.");
}

function getHeaderIndex(header: RawRow) {
  const map = new Map<string, number>();
  header.forEach((name, index) => {
    map.set(name.trim().toUpperCase(), index);
  });
  return map;
}

function getValue(row: RawRow, indexMap: Map<string, number>, key: string) {
  const index = indexMap.get(key);
  if (index === undefined) return "";
  return row[index] ?? "";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  loadEnvFromFile(".env.local");

  const { dryRun, limit } = parseArgs();
  const csvPath = resolveCsvPath();
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(content);

  if (rows.length < 2) {
    throw new Error("CSV appears to be empty.");
  }

  const header = rows[0];
  const headerIndex = getHeaderIndex(header);
  const missingHeaders = REQUIRED_HEADERS.filter((key) => !headerIndex.has(key));
  if (missingHeaders.length) {
    throw new Error(`CSV missing headers: ${missingHeaders.join(", ")}`);
  }

  const rawRows = rows.slice(1);
  const upcCounts = new Map<string, number>();

  for (const row of rawRows) {
    const upc = normalizeUpc(getValue(row, headerIndex, "MAINUPC"));
    if (!upc) continue;
    upcCounts.set(upc, (upcCounts.get(upc) ?? 0) + 1);
  }

  const targetRows = typeof limit === "number" ? rawRows.slice(0, limit) : rawRows;
  const items: NormalizedProduct[] = [];
  let skipped = 0;

  for (const row of targetRows) {
    const name = getValue(row, headerIndex, "ITEMNAME").trim();
    const category = normalizeCategory(getValue(row, headerIndex, "DEPNAME"));
    const upc = normalizeUpc(getValue(row, headerIndex, "MAINUPC"));
    const size = getValue(row, headerIndex, "SIZENAME").trim();
    const packRaw = getValue(row, headerIndex, "PACKNAME").trim();
    const pack = packRaw ? packRaw : "Single";
    const cost = parseNumber(getValue(row, headerIndex, "CURRENTCOST"));
    const price = parseNumber(getValue(row, headerIndex, "PRICEPERUNIT"));
    const stock = parseInteger(getValue(row, headerIndex, "TOTALQTY"));

    if (!name || !category || cost === null || price === null || stock === null) {
      skipped += 1;
      continue;
    }

    const key = slugify(`${category}|${name}|${size}|${pack}|${upc}`);
    const useUpc = upc && upcCounts.get(upc) === 1;
    const id = useUpc ? upc : createHash("sha1").update(key).digest("hex").slice(0, 24);

    items.push({
      id,
      createData: {
        name,
        category,
        subcategory: "",
        upc,
        size,
        pack,
        cost,
        price,
        stock,
        inStock: stock > 0,
        image: "",
        key,
      },
      updateData: {
        cost,
        price,
        stock,
        inStock: stock > 0,
      },
    });
  }

  const sample = items.slice(0, 5).map((item) => ({
    id: item.id,
    name: item.createData.name,
    category: item.createData.category,
    price: item.createData.price,
    stock: item.createData.stock,
    upc: item.createData.upc,
  }));

  console.log(`CSV rows: ${rawRows.length}`);
  if (typeof limit === "number") {
    console.log(`Limit applied: ${limit}`);
  }
  console.log(`Valid rows: ${items.length}`);
  console.log(`Skipped rows: ${skipped}`);
  console.log("Sample rows:");
  console.log(sample);

  const db = getFirestore(getAdminApp(), getDatabaseId());
  const collection = db.collection("products");

  const existingMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();

  for (const group of chunk(items, 500)) {
    const refs = group.map((item) => collection.doc(item.id));
    const snapshots = await db.getAll(...refs);
    snapshots.forEach((snapshot) => existingMap.set(snapshot.id, snapshot));
  }

  let created = 0;
  let updated = 0;

  if (!dryRun) {
    let batch = db.batch();
    let batchCount = 0;

    for (const item of items) {
      const ref = collection.doc(item.id);
      const existing = existingMap.get(item.id);

      if (existing?.exists) {
        updated += 1;
        batch.update(ref, {
          ...item.updateData,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        created += 1;
        batch.set(ref, {
          ...item.createData,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      batchCount += 1;
      if (batchCount >= 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
  } else {
    for (const item of items) {
      const existing = existingMap.get(item.id);
      if (existing?.exists) {
        updated += 1;
      } else {
        created += 1;
      }
    }
  }

  console.log("Summary:");
  console.log({
    totalRows: rawRows.length,
    processed: items.length,
    created,
    updated,
    skipped,
    dryRun,
  });
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});

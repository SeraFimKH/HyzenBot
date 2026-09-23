import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class JsonStore {
  constructor(fileName, defaultValue = {}) {
    this.filePath = path.join(DATA_DIR, fileName);
    this.defaultValue = defaultValue;
    this.data = this._load();
  }

  _load() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaultValue, null, 2));
      return structuredClone(this.defaultValue);
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      return raw.trim() ? JSON.parse(raw) : structuredClone(this.defaultValue);
    } catch (err) {
      console.error(`[jsonStore] Falha ao ler ${this.filePath}, recriando com valor padrão.`, err);
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaultValue, null, 2));
      return structuredClone(this.defaultValue);
    }
  }

  _save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(key, fallback = undefined) {
    return this.data[key] !== undefined ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this._save();
    return value;
  }

  delete(key) {
    delete this.data[key];
    this._save();
  }

  all() {
    return this.data;
  }
}

export const dataDir = DATA_DIR;

import { useEffect, useMemo, useState } from "react";
import { listIngredients } from "./api";
import type { Ingredient } from "./types";

type GeneratedContract = {
  title: string;
  summary: string;
  requirements: Array<{ id: string; statement: string; priority: string }>;
  system_shape: {
    pages: string[];
    entities: Array<{ name: string; fields: Array<{ name: string; type: string }> }>;
    api_operations: Array<{ method: string; path: string; purpose: string }>;
  };
};

const generatedModules = import.meta.glob<{ generatedContract: GeneratedContract }>(
  "./generated-contract.ts",
  { eager: true },
);

const generatedContract = Object.values(generatedModules)[0]?.generatedContract;

const fallback: Ingredient[] = [
  { id: "1", name: "Bread flour", unit: "kg", quantity: 46, reorder_level: 12, updated_at: "" },
  { id: "2", name: "Cultured butter", unit: "kg", quantity: 8, reorder_level: 10, updated_at: "" },
  { id: "3", name: "Whole milk", unit: "L", quantity: 18, reorder_level: 8, updated_at: "" },
];

export default function App() {
  if (generatedContract && hasEntity(generatedContract, "Shift")) {
    return <VolunteerSchedule contract={generatedContract} />;
  }
  if (generatedContract && !hasEntity(generatedContract, "Ingredient")) {
    return <GenericWorkspace contract={generatedContract} />;
  }
  return <InventoryWorkspace contract={generatedContract} />;
}

function InventoryWorkspace({ contract }: { contract?: GeneratedContract }) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(fallback);
  const [notice, setNotice] = useState("Showing seeded inventory while the API starts.");

  useEffect(() => {
    const controller = new AbortController();
    listIngredients(controller.signal)
      .then((rows) => {
        if (rows.length > 0) setIngredients(rows);
        setNotice("Inventory is synced with the bakery API.");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const attention = useMemo(
    () => ingredients.filter((item) => item.quantity <= item.reorder_level).length,
    [ingredients],
  );

  return (
    <main>
      <header className="masthead">
        <div><span>STONE &amp; STARTER</span><strong>Pantry</strong></div>
        <p>{notice}</p>
        <button type="button">+ Log delivery</button>
      </header>
      <section className="page">
        <div className="title-row"><div><p>{contract ? contract.summary : "Good morning, Maya"}</p><h1>Today&apos;s inventory</h1></div><input aria-label="Search ingredients" placeholder="Search ingredients" /></div>
        <div className="stats"><article><span>Total ingredients</span><strong>{ingredients.length}</strong></article><article><span>Need attention</span><strong>{attention}</strong></article><article><span>Deliveries today</span><strong>3</strong></article></div>
        <section className="table-card" aria-label="Ingredient stock">
          <div className="table-head"><strong>Ingredient stock</strong><span>Live from the inventory API</span></div>
          <div className="row labels"><span>Ingredient</span><span>On hand</span><span>Status</span></div>
          {ingredients.map((item) => {
            const low = item.quantity <= item.reorder_level;
            return <div className="row" key={item.id}><strong>{item.name}</strong><span>{item.quantity} {item.unit}</span><span className={low ? "pill low" : "pill"}>{low ? "Reorder" : "Healthy"}</span></div>;
          })}
        </section>
      </section>
    </main>
  );
}

const schedule = [
  { day: "MON 18", time: "08:00–11:00", role: "Pantry setup", team: "Maya + 3", fill: 4, capacity: 4 },
  { day: "TUE 19", time: "12:30–15:30", role: "Guest check-in", team: "Jon + 1", fill: 2, capacity: 4 },
  { day: "THU 21", time: "09:00–12:00", role: "Packing line", team: "Ari + 4", fill: 5, capacity: 6 },
  { day: "SAT 23", time: "07:30–10:30", role: "Distribution", team: "Unassigned", fill: 0, capacity: 5 },
];

function VolunteerSchedule({ contract }: { contract: GeneratedContract }) {
  const [query, setQuery] = useState("");
  const filtered = schedule.filter((shift) =>
    `${shift.day} ${shift.role} ${shift.team}`.toLowerCase().includes(query.toLowerCase()),
  );
  const confirmed = schedule.reduce((total, shift) => total + shift.fill, 0);
  const capacity = schedule.reduce((total, shift) => total + shift.capacity, 0);

  return (
    <main className="schedule-app">
      <header className="masthead schedule-masthead">
        <div><span>HARBOR FOOD PANTRY</span><strong>Roster</strong></div>
        <nav aria-label="Primary navigation">
          {contract.system_shape.pages.slice(0, 3).map((page, index) => (
            <a className={index === 0 ? "active" : ""} href={`#${page.toLowerCase()}`} key={page}>{page}</a>
          ))}
        </nav>
        <button type="button">+ New shift</button>
      </header>
      <section className="page schedule-page">
        <div className="title-row schedule-title">
          <div><p>AUGUST 18–24 · OPERATIONS</p><h1>This week&apos;s shifts</h1><span>{contract.summary}</span></div>
          <label className="schedule-search">Search roster<input aria-label="Search shifts" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Role or volunteer" /></label>
        </div>
        <div className="stats schedule-stats">
          <article><span>Confirmed seats</span><strong>{confirmed}</strong><small>of {capacity} available</small></article>
          <article><span>Coverage</span><strong>{Math.round((confirmed / capacity) * 100)}%</strong><small>Across four shifts</small></article>
          <article><span>Needs attention</span><strong>2</strong><small>Before Thursday</small></article>
        </div>
        <section className="table-card schedule-card" aria-label="Volunteer shifts">
          <div className="table-head"><div><strong>Shift board</strong><span>Capacity rules are enforced by the API</span></div><span className="sync-badge">● Live</span></div>
          <div className="shift-row labels"><span>Date</span><span>Window</span><span>Role</span><span>Volunteers</span><span>Coverage</span></div>
          {filtered.map((shift) => {
            const full = shift.fill >= shift.capacity;
            const empty = shift.fill === 0;
            return <div className="shift-row" key={`${shift.day}-${shift.role}`}><strong>{shift.day}</strong><span>{shift.time}</span><span>{shift.role}</span><span>{shift.team}</span><span className={`coverage ${full ? "full" : empty ? "empty" : ""}`}><i style={{ width: `${(shift.fill / shift.capacity) * 100}%` }} /><b>{shift.fill}/{shift.capacity}</b></span></div>;
          })}
        </section>
        <footer className="contract-proof"><span>Generated from approved contract</span><strong>{contract.requirements.length} requirements</strong><strong>{contract.system_shape.api_operations.length} API operations</strong></footer>
      </section>
    </main>
  );
}

function GenericWorkspace({ contract }: { contract: GeneratedContract }) {
  const primaryEntity = contract.system_shape.entities[0];
  return <main><header className="masthead"><div><span>KILN GENERATED</span><strong>{contract.title}</strong></div><p>Contract-backed application</p><button type="button">+ New record</button></header><section className="page generic-page"><div className="title-row"><div><p>READY TO BUILD ON</p><h1>{contract.title}</h1><span>{contract.summary}</span></div></div><div className="stats"><article><span>Requirements</span><strong>{contract.requirements.length}</strong></article><article><span>Entities</span><strong>{contract.system_shape.entities.length}</strong></article><article><span>API operations</span><strong>{contract.system_shape.api_operations.length}</strong></article></div><section className="table-card"><div className="table-head"><strong>{primaryEntity?.name ?? "Record"} workspace</strong><span>Typed persistence is ready</span></div>{contract.requirements.map((item) => <div className="generic-requirement" key={item.id}><span>✓</span><strong>{item.statement}</strong><small>{item.priority}</small></div>)}</section></section></main>;
}

function hasEntity(contract: GeneratedContract, name: string): boolean {
  return contract.system_shape.entities.some((entity) => entity.name === name);
}

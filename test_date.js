const start = new Date("2026-06-14");
const end = new Date("2026-06-17");

for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
  const dateStr = d.toISOString().split('T')[0];
  const isFirstNight = d.getTime() === start.getTime();
  console.log(`d: ${d.toISOString()}, dateStr: ${dateStr}, isFirstNight: ${isFirstNight}`);
}

export interface Env {
	TOKEN: string;
	CHAT_ID: string;
	GOLD_KV: KVNamespace;
	THRESHOLD?: string;    // Optional: change threshold (e.g. "50000")
	HISTORY_DAYS?: string; // Optional: change history window (default "3")
}

type GoldItem = {
	source: string;
	type: string;
	name: string;
	buy: number;
	sell: number;
	change_sell: number;
	delta: number; // Change since last bot notification
	time: string;
	date: string;
};

export default {
	async fetch(req: Request, env: Env) {
		await runJob(env, true); // Manual trigger shows full summary
		return new Response("✅ Manual run");
	},

	async scheduled(event: ScheduledEvent, env: Env) {
		console.log("⏰ Cron triggered");
		await runJob(env, false); // Cron trigger only shows changes
	}
};

// 🚀 MAIN
async function runJob(env: Env, isManual: boolean) {
	try {
		// 1. Define sources and types
		const giaVangTypes = ["SJL1L10", "SJ9999"];
		const miHongCodes = ["SJC"];

		// 2. Fetch from all sources
		const tasks = [
			fetchMiHong(miHongCodes),
			...giaVangTypes.map(t => fetchGiaVang(t))
		];

		const results = await Promise.allSettled(tasks);
		const success: GoldItem[] = results
			.filter(r => r.status === "fulfilled")
			.flatMap((r: any) => Array.isArray(r.value) ? r.value : [r.value]);

		if (!success.length) {
			console.log("❌ No data fetched from any source");
			return;
		}

		// 🔑 LOAD LAST
		const lastRaw = await env.GOLD_KV.get("last_prices");
		const lastPrices: Record<string, number> = lastRaw ? JSON.parse(lastRaw) : {};

		// 🔍 DETECT CHANGE (key = source_type)
		const threshold = parseInt(env.THRESHOLD || "50000");
		let changed = false;
		for (const item of success) {
			const key = `${item.source}_${item.type}`;
			const last = lastPrices[key];
			if (!last || Math.abs(item.sell - last) > threshold) {
				changed = true;
				break;
			}
		}

		// 📈 UPDATE HISTORY (sliding window)
		const historyDays = parseInt(env.HISTORY_DAYS || "3");
		const historyRaw = await env.GOLD_KV.get("history_prices");
		let history: Record<string, { p: number, t: number }[]> = historyRaw ? JSON.parse(historyRaw) : {};
		const now = Date.now();
		const windowMs = historyDays * 24 * 60 * 60 * 1000;
		const cutoff = now - windowMs;

		success.forEach(item => {
			const key = `${item.source}_${item.type}`;
			if (!history[key]) history[key] = [];
			history[key].push({ p: item.sell, t: now });
			history[key] = history[key].filter(entry => entry.t > cutoff);
		});

		await env.GOLD_KV.put("history_prices", JSON.stringify(history));

		// 🎯 FILTER CHANGED ITEMS FOR MESSAGE
		const formattedItems = success.map(item => {
			const key = `${item.source}_${item.type}`;
			const last = lastPrices[key];
			return {
				...item,
				delta: last ? item.sell - last : 0
			};
		});

		const changedItems = formattedItems.filter(item => {
			const key = `${item.source}_${item.type}`;
			const last = lastPrices[key];
			return !last || Math.abs(item.sell - last) > threshold;
		});

		// 🧾 DECIDE WHAT TO REPORT
		const itemsToReport = isManual ? formattedItems : changedItems;

		// ⛔ STOP IF NO CHANGE (for cron)
		if (!isManual && !changed) {
			console.log("⏸ No changes to report");
			return;
		}

		// 🧾 BUILD MESSAGE & CHART
		const text = buildMessage(itemsToReport);
		const chartUrl = generateChartUrl(success, history);

		// 📩 SEND TELEGRAM (1. Summary Text)
		const tgTextRes = await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: env.CHAT_ID,
				text,
				parse_mode: "HTML"
			})
		});

		// 📩 SEND TELEGRAM (2. History Chart)
		await fetch(`https://api.telegram.org/bot${env.TOKEN}/sendPhoto`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: env.CHAT_ID,
				photo: chartUrl,
				caption: "Price Trend (Sampled Hourly)"
			})
		});

		const tgRes = await tgTextRes.json() as any;
		console.log("📩 Telegram Status:", tgTextRes.status, JSON.stringify(tgRes));

		// 💾 SAVE NEW PRICES (Merge)
		if (tgTextRes.ok) {
			const updatedPrices = { ...lastPrices };
			success.forEach(item => {
				const key = `${item.source}_${item.type}`;
				updatedPrices[key] = item.sell;
			});
			await env.GOLD_KV.put("last_prices", JSON.stringify(updatedPrices));
		}

	} catch (err) {
		console.error("🔥 ERROR:", err);
	}
}

// 🔁 FETCH: giavang.now
async function fetchGiaVang(type: string): Promise<GoldItem> {
	const res = await fetch(`https://giavang.now/api/prices?type=${type}`);
	if (!res.ok) throw new Error(`giavang.now failed: ${type}`);

	const data: any = await res.json();
	const item = data?.data?.[0] || data;

	if (!item?.sell) throw new Error(`giavang.now invalid: ${type}`);

	return {
		source: "GV",
		type,
		name: item.name || type,
		buy: item.buy / 10,  // Convert to "chỉ" (1 lượng = 10 chỉ)
		sell: item.sell / 10,
		change_sell: (item.change_sell || 0) / 10,
		delta: 0, // Will be calculated in runJob
		time: item.time,
		date: item.date
	};
}

// 🔁 FETCH: mihong.vn
async function fetchMiHong(codes: string[]): Promise<GoldItem[]> {
	// Add cache buster to URL and use no-store to bypass Cloudflare/API caches
	const res = await fetch(`https://api.mihong.vn/v1/gold-prices?market=domestic&t=${Date.now()}`, {
		cf: { cacheTtl: 0, cacheEverything: false } as any, // Specialized CF fetch options
		headers: { "Cache-Control": "no-cache" }
	});
	if (!res.ok) throw new Error("Mi Hong API failed");

	const data: any[] = await res.json();

	return data
		.filter(item => codes.includes(item.code))
		.map(item => ({
			source: "MH",
			type: item.code,
			name: `Mi Hồng ${item.code}`,
			buy: item.buyingPrice,
			sell: item.sellingPrice,
			change_sell: item.sellChange || 0,
			delta: 0, // Will be calculated in runJob
			time: item.dateTime.split(" ")[1],
			date: item.dateTime.split(" ")[0]
		}));
}

// 💰 FORMAT
function formatPrice(n: number) {
	return n.toLocaleString("vi-VN") + " VND";
}

function formatChange(n: number) {
	const sign = n > 0 ? "📈 +" : n < 0 ? "📉 " : "➖ ";
	return sign + n.toLocaleString("vi-VN");
}

// 🧾 MESSAGE
function buildMessage(list: GoldItem[]) {
	const groups = list.reduce((acc, item) => {
		if (!acc[item.source]) acc[item.source] = [];
		acc[item.source].push(item);
		return acc;
	}, {} as Record<string, GoldItem[]>);

	const sources = Object.keys(groups).sort((a, b) => {
		if (a === "MH") return -1;
		if (b === "MH") return 1;
		return 0;
	});

	return sources.map(source => {
		const items = groups[source];
		const sourceName = source === "MH" ? "🏢 <b>Mi Hồng</b>" : "🏦 <b>GiaVang</b>";
		const itemText = items.map(item => {
			const trend = item.delta > 0 ? "�" : item.delta < 0 ? "📉" : "➖";
			const deltaText = item.delta !== 0
				? `(Net: ${item.delta > 0 ? '� +' : '� '}${Math.abs(item.delta).toLocaleString("vi-VN")} VND)`
				: "";

			return `
💰 <b>${item.name}</b> ${trend}
📅 ${item.date} ${item.time}
🟢 Buy:  ${formatPrice(item.buy)}
🔴 Sell: ${formatPrice(item.sell)} ${deltaText}
📊 ${formatChange(item.change_sell)}`;
		}).join("\n");

		return `${sourceName}\n${itemText}`;
	}).join("\n\n----------------------\n\n");
}

// 📈 CHART
function generateChartUrl(current: GoldItem[], history: Record<string, { p: number, t: number }[]>) {
	const colors = [
		"#ff0000", // Bright Red
		"#0000ff", // Bright Blue
		"#00aa00", // Green
		"#aa00aa", // Purple
		"#ff8c00", // Dark Orange
		"#00ced1"  // Dark Turquoise
	];

	// 1. Process labels and datasets by sampling hourly
	const firstKey = `${current[0].source}_${current[0].type}`;
	const rawHistory = history[firstKey] || [];

	const hourGroups: Record<string, number> = {};
	rawHistory.forEach(d => {
		const date = new Date(d.t + (7 * 60 * 60 * 1000));
		const bucket = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
		hourGroups[bucket] = d.t;
	});

	const sampledTimestamps = Object.values(hourGroups).sort((a, b) => a - b);

	const labels = sampledTimestamps.map(t => {
		const date = new Date(t + (7 * 60 * 60 * 1000));
		return `${date.getUTCDate()}/${date.getUTCMonth() + 1} ${date.getUTCHours()}h`;
	});

	const datasets = current.map((item, i) => {
		const key = `${item.source}_${item.type}`;
		const itemHistory = history[key] || [];

		const sampledPrices = sampledTimestamps.map(targetT => {
			const closest = itemHistory.reduce((prev, curr) =>
				Math.abs(curr.t - targetT) < Math.abs(prev.t - targetT) ? curr : prev
				, { p: item.sell, t: Date.now() });
			return closest.p;
		});

		return {
			label: item.name,
			data: sampledPrices,
			borderColor: colors[i % colors.length],
			fill: false,
			borderWidth: 2,
			pointRadius: sampledPrices.length > 50 ? 0 : 3
		};
	});

	const chartConfig = {
		type: "line",
		data: { labels, datasets },
		options: {
			title: { display: true, text: "Gold Price Trend (Hourly)" },
			legend: { position: "bottom" },
			scales: {
				xAxes: [{ ticks: { maxTicksLimit: 12, autoSkip: true } }],
				yAxes: [{
					ticks: {
						callback: (val: number) => (val / 1000000).toFixed(1) + "M"
					}
				}]
			}
		}
	};

	return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=800&height=500&backgroundColor=white`;
}
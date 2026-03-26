<svelte:head>
	<title>{uiState.lang === 'vi' ? 'Bảng Giá Vàng Trực Tuyến - Mi Hồng & SJC' : 'Gold Price Dashboard - Mi Hong & SJC'}</title>
	<meta name="description" content="{uiState.lang === 'vi' ? 'Theo dõi giá vàng hôm nay trực tuyến từ Mi Hồng và SJC. Cập nhật biểu đồ lịch sử, thông báo tự động và giao diện chuyên nghiệp.' : 'Track today\'s gold prices online from Mi Hong and SJC. Live trend charts, automated notifications, and boutique dashboard.'}">
	<meta name="keywords" content="giá vàng, gia vang, gia vang hom nay, mi hong, sjc, gold price vietnam, bảng giá vàng">
	
	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website">
	<meta property="og:title" content="Gold Price Dashboard">
	<meta property="og:description" content="Live Gold Prices from Mi Hong & SJC">
	
	<!-- Canonical -->
	<link rel="canonical" href="https://anhle.gold-prices-bot.workers.dev/">
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { uiState, initUIState, setLang, toggleTheme } from '$lib/uiState.svelte';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		initUIState();
	});
</script>

<main id="dashboard-root">
	<div class="container">
		<header>
			<div class="top-controls">
				<div class="lang-switch">
					<div class="lang-indicator"></div>
					<button 
						class="lang-btn" 
						class:active={uiState.lang === 'en'} 
						onclick={() => setLang('en')}
					>EN</button>
					<button 
						class="lang-btn" 
						class:active={uiState.lang === 'vi'} 
						onclick={() => setLang('vi')}
					>VN</button>
				</div>
				<button class="btn-toggle" onclick={toggleTheme} title="Toggle Theme">
					<svg class="theme-icon-sun" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg>
					<svg class="theme-icon-moon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
				</button>
			</div>
			<h1>
				<span lang="en">GOLD PRICE</span>
				<span lang="vi">BẢNG GIÁ VÀNG</span>
			</h1>
			<p class="subtitle">
				<span lang="en">Live market prices from Mi Hong & SJC</span>
				<span lang="vi">Giá thị trường trực tuyến từ Mi Hồng & SJC</span>
			</p>
		</header>

		{@render children()}

		<footer>
			<p>
				<span lang="en">Last updated: </span>
				<span lang="vi">Dữ liệu cập nhật: </span>
				{new Date().toLocaleString('vi-VN')}
			</p>
			<p style="margin-top: 0.5rem; opacity: 0.7;">© 2026 BesAnh</p>
		</footer>
	</div>
</main>

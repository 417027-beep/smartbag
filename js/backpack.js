function backpackTodayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 書包紀錄只在當天有效；跨日或舊版沒有日期的資料一律視為空白
function normalizeBackpackRecord(record) {
    const empty = { date: backpackTodayKey(), items: {}, confirmed: false };
    if (!record || typeof record !== 'object') return empty;
    if (record.date !== backpackTodayKey()) return empty;
    return {
        date: record.date,
        items: record.items && typeof record.items === 'object' ? record.items : {},
        confirmed: !!record.confirmed,
        confirmedAt: record.confirmedAt
    };
}

function touchBackpackRecord(record) {
    if (!record || typeof record !== 'object') return record;
    const today = backpackTodayKey();
    if (record.date !== today) {
        record.date = today;
        record.items = {};
        record.confirmed = false;
        delete record.confirmedAt;
    }
    return record;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawBackpack(canvasId, packedCount, totalCount) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth || 300;
    const h = canvas.getAttribute('height') ? parseInt(canvas.getAttribute('height'), 10) : 340;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const ready = totalCount > 0 && packedCount === totalCount;
    const cx = w / 2;
    const bodyW = w * 0.42;
    const bodyH = h * 0.5;
    const bx = cx - bodyW / 2;
    const by = h * 0.28;

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + bodyW * 0.25, by + 6);
    ctx.quadraticCurveTo(cx, by + bodyH + 26, bx + bodyW * 0.75, by + 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, by - 8, 14, Math.PI, 0);
    ctx.stroke();

    const grad = ctx.createLinearGradient(bx, by, bx, by + bodyH);
    grad.addColorStop(0, ready ? '#10b981' : '#6366f1');
    grad.addColorStop(1, ready ? '#047857' : '#4338ca');
    ctx.fillStyle = grad;
    roundRect(ctx, bx, by, bodyW, bodyH, 18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, by + bodyH * 0.55);
    ctx.lineTo(bx + bodyW, by + bodyH * 0.55);
    ctx.stroke();

    roundRect(ctx, bx + bodyW * 0.15, by + bodyH * 0.62, bodyW * 0.7, bodyH * 0.26, 10);
    ctx.stroke();

    const dots = Math.min(totalCount, 8);
    if (dots > 0) {
        const dotR = Math.min(w * 0.02, 8);
        const gap = bodyW / (dots + 1);
        for (let i = 1; i <= dots; i++) {
            const dx = bx + gap * i;
            const dy = by + bodyH * 0.55 + 12;
            ctx.beginPath();
            ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
            ctx.fillStyle = i <= packedCount ? '#4ade80' : 'rgba(148,163,184,0.5)';
            ctx.fill();
        }
    }

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 15px "Segoe UI", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('已裝 ' + packedCount + ' / ' + totalCount, cx, h - 10);
}

function renderBackpackItems(containerId, items, editable, callback) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = '<p style="text-align:center;color:#94a3b8;font-size:14px;padding:12px;">今天沒有需要攜帶的物品 🎉</p>';
        return;
    }
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'item-row' + (item.scanned ? ' packed' : '') + (editable ? ' clickable' : '');
        row.innerHTML = '<span class="item-icon">' + (item.scanned ? '✅' : '⬜') + '</span>' +
            '<span class="item-name"></span>' +
            '<span class="item-type">' + (item.type === 'book' ? '課本' : '裝備') + '</span>';
        row.querySelector('.item-name').textContent = item.name;
        if (editable && callback) {
            row.onclick = () => callback(item);
        }
        el.appendChild(row);
    });
}

function updateBackpackProgress(barId, summaryId, items) {
    const packed = items.filter(i => i.scanned).length;
    const pct = items.length === 0 ? 100 : Math.round((packed / items.length) * 100);
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = pct + '%';
    const sum = document.getElementById(summaryId);
    if (sum) {
        sum.textContent = items.length === 0
            ? '今天沒有課程，書包是空的！🎉'
            : '已收拾 ' + packed + ' / ' + items.length + ' 項（' + pct + '%）';
    }
    return { packed, total: items.length };
}
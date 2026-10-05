const {
    createCanvas,
    loadImage
} = require("@napi-rs/canvas");

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);

    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + r
    );

    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - r,
        y + height
    );

    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - r
    );

    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(
        x,
        y,
        x + r,
        y
    );

    ctx.closePath();
}

function drawStar(ctx, cx, cy, outerRadius, innerRadius) {
    let rotation = -Math.PI / 2;

    ctx.beginPath();

    for (let i = 0; i < 10; i++) {
        const radius =
            i % 2 === 0
                ? outerRadius
                : innerRadius;

        const x =
            cx + Math.cos(rotation) * radius;

        const y =
            cy + Math.sin(rotation) * radius;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        rotation += Math.PI / 5;
    }

    ctx.closePath();
}

function cutText(ctx, text, maxWidth) {
    let result = text;

    while (
        ctx.measureText(result).width > maxWidth &&
        result.length > 3
    ) {
        result = result.slice(0, -1);
    }

    if (result !== text) {
        result += "...";
    }

    return result;
}

async function createLeaderboardCard(rows, guildName) {
    const width = 1400;
    const height = 900;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // ============================
    // BACKGROUND
    // ============================

    const bg = ctx.createLinearGradient(
        0,
        0,
        width,
        height
    );

    bg.addColorStop(0, "#330303");
    bg.addColorStop(0.4, "#700808");
    bg.addColorStop(0.75, "#8F0C0C");
    bg.addColorStop(1, "#3A0303");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Star Việt Nam
    ctx.save();

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#FFD75A";

    drawStar(
        ctx,
        1160,
        190,
        175,
        70
    );

    ctx.fill();

    ctx.restore();

    // Hoa văn tròn
    ctx.save();

    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = "#FFD75A";
    ctx.lineWidth = 2;

    for (let r = 60; r <= 280; r += 40) {
        ctx.beginPath();

        ctx.arc(
            1200,
            190,
            r,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    ctx.restore();

    // Khung ngoài
    ctx.strokeStyle = "#E8B94B";
    ctx.lineWidth = 3;

    roundRect(
        ctx,
        18,
        18,
        width - 36,
        height - 36,
        24
    );

    ctx.stroke();

    // ============================
    // HEADER
    // ============================

    ctx.fillStyle = "#FFD75A";
    ctx.font = "bold 34px Arial";

    ctx.fillText(
        "VIETNAM LEGACY",
        70,
        75
    );

    ctx.fillStyle = "#FFF0C2";
    ctx.font = "bold 46px Arial";

    ctx.fillText(
        "TOP 10 CHAT LEVEL",
        70,
        135
    );

    ctx.fillStyle = "#D9BA79";
    ctx.font = "19px Arial";

    ctx.fillText(
        `${guildName} • Bảng xếp hạng hoạt động`,
        70,
        172
    );

    // ============================
    // TABLE HEADER
    // ============================

    const tableX = 65;
    const tableY = 215;
    const tableWidth = 1270;

    ctx.fillStyle = "rgba(35, 3, 3, 0.85)";

    roundRect(
        ctx,
        tableX,
        tableY,
        tableWidth,
        55,
        12
    );

    ctx.fill();

    ctx.fillStyle = "#D8B875";
    ctx.font = "bold 18px Arial";

    ctx.fillText("#", 95, 250);
    ctx.fillText("THÀNH VIÊN", 185, 250);
    ctx.fillText("LEVEL", 910, 250);
    ctx.fillText("TỔNG XP", 1110, 250);

    // ============================
    // ROWS
    // ============================

    const rowHeight = 58;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const y =
            tableY +
            70 +
            i * rowHeight;

        // Top 3 khác màu nhẹ
        if (i === 0) {
            ctx.fillStyle =
                "rgba(170, 110, 20, 0.28)";
        } else if (i === 1) {
            ctx.fillStyle =
                "rgba(180, 180, 180, 0.14)";
        } else if (i === 2) {
            ctx.fillStyle =
                "rgba(150, 75, 25, 0.20)";
        } else {
            ctx.fillStyle =
                "rgba(30, 3, 3, 0.62)";
        }

        roundRect(
            ctx,
            tableX,
            y,
            tableWidth,
            48,
            10
        );

        ctx.fill();

        // Rank
        let rankText = `#${i + 1}`;

        if (i === 0) rankText = "1";
        if (i === 1) rankText = "2";
        if (i === 2) rankText = "3";

        ctx.fillStyle =
            i < 3
                ? "#FFD75A"
                : "#D9BA79";

        ctx.font =
            i < 3
                ? "bold 23px Arial"
                : "bold 18px Arial";

        ctx.fillText(
            rankText,
            90,
            y + 32
        );

        // Avatar
        try {
            const response =
                await fetch(row.avatarURL);

            if (response.ok) {
                const buffer =
                    Buffer.from(
                        await response.arrayBuffer()
                    );

                const avatar =
                    await loadImage(buffer);

                const size = 36;

                ctx.save();

                ctx.beginPath();

                ctx.arc(
                    150,
                    y + 24,
                    size / 2,
                    0,
                    Math.PI * 2
                );

                ctx.clip();

                ctx.drawImage(
                    avatar,
                    132,
                    y + 6,
                    size,
                    size
                );

                ctx.restore();
            }
        } catch {
            // Nếu avatar lỗi thì bỏ qua
        }

        // Username
        ctx.font = "bold 19px Arial";
        ctx.fillStyle = "#FFF0C2";

        const name =
            cutText(
                ctx,
                row.displayName,
                600
            );

        ctx.fillText(
            name,
            185,
            y + 31
        );

        // Level
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#FFE29A";

        ctx.fillText(
            `${row.level}`,
            925,
            y + 31
        );

        // XP
        ctx.fillText(
            Number(row.totalXp)
                .toLocaleString("vi-VN"),
            1110,
            y + 31
        );
    }

    // Footer
    ctx.fillStyle = "#D9BA79";
    ctx.font = "17px Arial";

    ctx.fillText(
        "Cảm ơn mọi người đã luôn hoạt động và đồng hành cùng VietNam Legacy ❤️",
        70,
        845
    );

    return canvas.toBuffer("image/png");
}

module.exports = {
    createLeaderboardCard
};
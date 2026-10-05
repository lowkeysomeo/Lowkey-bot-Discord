const fs = require("node:fs");

const {
    createCanvas,
    loadImage,
    GlobalFonts
} = require("@napi-rs/canvas");


// ========================================
// LOAD FONT CHO RAILWAY / LINUX
// ========================================

function loadFonts() {
    const fonts = [
        {
            path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            name: "VNL"
        },
        {
            path: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            name: "VNL Bold"
        }
    ];

    for (const font of fonts) {
        try {
            if (fs.existsSync(font.path)) {
                GlobalFonts.registerFromPath(
                    font.path,
                    font.name
                );
            }
        } catch (error) {
            console.log(
                `Không load được font ${font.name}:`,
                error.message
            );
        }
    }
}

loadFonts();


// ========================================
// FONT
// ========================================

const REGULAR_FONT =
    '"VNL", "DejaVu Sans", Arial, sans-serif';

const BOLD_FONT =
    '"VNL Bold", "DejaVu Sans", Arial, sans-serif';


// ========================================
// BO GÓC
// ========================================

function roundRect(
    ctx,
    x,
    y,
    width,
    height,
    radius
) {
    const r =
        Math.min(
            radius,
            width / 2,
            height / 2
        );

    ctx.beginPath();

    ctx.moveTo(
        x + r,
        y
    );

    ctx.lineTo(
        x + width - r,
        y
    );

    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + r
    );

    ctx.lineTo(
        x + width,
        y + height - r
    );

    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - r,
        y + height
    );

    ctx.lineTo(
        x + r,
        y + height
    );

    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - r
    );

    ctx.lineTo(
        x,
        y + r
    );

    ctx.quadraticCurveTo(
        x,
        y,
        x + r,
        y
    );

    ctx.closePath();
}


// ========================================
// NGÔI SAO
// ========================================

function drawStar(
    ctx,
    cx,
    cy,
    outerRadius,
    innerRadius
) {
    const spikes = 5;

    let rotation =
        -Math.PI / 2;

    ctx.beginPath();

    for (
        let i = 0;
        i < spikes * 2;
        i++
    ) {
        const radius =
            i % 2 === 0
                ? outerRadius
                : innerRadius;

        const x =
            cx +
            Math.cos(rotation) *
                radius;

        const y =
            cy +
            Math.sin(rotation) *
                radius;

        if (i === 0) {
            ctx.moveTo(
                x,
                y
            );
        } else {
            ctx.lineTo(
                x,
                y
            );
        }

        rotation +=
            Math.PI / spikes;
    }

    ctx.closePath();
}


// ========================================
// TỰ GIẢM FONT USERNAME
// ========================================

function fitFont(
    ctx,
    text,
    maxWidth,
    startSize,
    minSize = 22
) {
    let size =
        startSize;

    while (
        size > minSize
    ) {
        ctx.font =
            `${size}px ${BOLD_FONT}`;

        if (
            ctx.measureText(text)
                .width <= maxWidth
        ) {
            break;
        }

        size -= 2;
    }

    return size;
}


// ========================================
// CREATE RANK CARD
// ========================================

async function createRankCard(
    data
) {
    const {
        avatarURL,
        username,
        displayName,
        level,
        rank,
        totalXp,
        currentXp,
        requiredXp
    } = data;


    const width = 1200;
    const height = 450;


    const canvas =
        createCanvas(
            width,
            height
        );


    const ctx =
        canvas.getContext(
            "2d"
        );


    // ========================================
    // BACKGROUND
    // ========================================

    const bg =
        ctx.createLinearGradient(
            0,
            0,
            width,
            height
        );

    bg.addColorStop(
        0,
        "#3B0505"
    );

    bg.addColorStop(
        0.35,
        "#6E0808"
    );

    bg.addColorStop(
        0.7,
        "#8F0D0D"
    );

    bg.addColorStop(
        1,
        "#420404"
    );

    ctx.fillStyle = bg;

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // ========================================
    // ÁNH SÁNG
    // ========================================

    const glow =
        ctx.createRadialGradient(
            650,
            170,
            20,
            650,
            170,
            650
        );

    glow.addColorStop(
        0,
        "rgba(210,45,30,0.35)"
    );

    glow.addColorStop(
        1,
        "rgba(120,0,0,0)"
    );

    ctx.fillStyle = glow;

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // ========================================
    // SAO MỜ
    // ========================================

    ctx.save();

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#FFD75A";

    drawStar(
        ctx,
        1020,
        155,
        120,
        48
    );

    ctx.fill();

    ctx.restore();


    // ========================================
    // HOA VĂN TRÒN
    // ========================================

    ctx.save();

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#FFD75A";
    ctx.lineWidth = 2;

    for (
        let r = 45;
        r <= 200;
        r += 30
    ) {
        ctx.beginPath();

        ctx.arc(
            1050,
            150,
            r,
            0,
            Math.PI * 2
        );

        ctx.stroke();
    }

    ctx.restore();


    // ========================================
    // KHUNG
    // ========================================

    ctx.strokeStyle =
        "#E8B94B";

    ctx.lineWidth = 3;

    roundRect(
        ctx,
        14,
        14,
        width - 28,
        height - 28,
        20
    );

    ctx.stroke();


    ctx.strokeStyle =
        "rgba(255,215,90,0.30)";

    ctx.lineWidth = 1;

    roundRect(
        ctx,
        23,
        23,
        width - 46,
        height - 46,
        17
    );

    ctx.stroke();


    // ========================================
    // BRAND
    // ========================================

    ctx.fillStyle =
        "#FFD75A";

    ctx.font =
        `25px ${BOLD_FONT}`;

    ctx.fillText(
        "VIETNAM LEGACY",
        900,
        52
    );


    ctx.fillStyle =
        "rgba(255,230,160,0.80)";

    ctx.font =
        `14px ${REGULAR_FONT}`;

    ctx.fillText(
        "COMMUNITY • LEGACY • VIETNAM",
        900,
        77
    );


    // ========================================
    // AVATAR
    // ========================================

    const avatarResponse =
        await fetch(
            avatarURL
        );

    if (
        !avatarResponse.ok
    ) {
        throw new Error(
            "Không thể tải avatar Discord."
        );
    }


    const avatarBuffer =
        Buffer.from(
            await avatarResponse
                .arrayBuffer()
        );


    const avatar =
        await loadImage(
            avatarBuffer
        );


    const avatarSize = 155;

    const avatarX = 65;
    const avatarY = 70;


    const centerX =
        avatarX +
        avatarSize / 2;

    const centerY =
        avatarY +
        avatarSize / 2;


    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        avatarSize / 2 + 9,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        "#E8B94B";

    ctx.fill();


    ctx.save();

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        avatarSize / 2,
        0,
        Math.PI * 2
    );

    ctx.clip();

    ctx.drawImage(
        avatar,
        avatarX,
        avatarY,
        avatarSize,
        avatarSize
    );

    ctx.restore();


    // ========================================
    // USER INFO
    // ========================================

    const nameX = 265;


    const nameSize =
        fitFont(
            ctx,
            username,
            500,
            50
        );


    ctx.font =
        `${nameSize}px ${BOLD_FONT}`;

    ctx.fillStyle =
        "#FFF0C2";

    ctx.fillText(
        username,
        nameX,
        125
    );


    ctx.font =
        `25px ${REGULAR_FONT}`;

    ctx.fillStyle =
        "#E7C57B";

    ctx.fillText(
        displayName ||
            username,
        nameX,
        165
    );


    ctx.font =
        `16px ${REGULAR_FONT}`;

    ctx.fillStyle =
        "rgba(255,240,194,0.75)";

    ctx.fillText(
        "Thành viên VietNam Legacy",
        nameX,
        197
    );


    // ========================================
    // BOX INFO
    // ========================================

    const infoY = 260;
    const infoHeight = 92;

    const gap = 20;
    const startX = 55;


    const boxWidth =
        (
            width -
            110 -
            gap * 2
        ) / 3;


    function drawInfoBox(
        x,
        title,
        value
    ) {
        const boxBg =
            ctx.createLinearGradient(
                x,
                infoY,
                x,
                infoY +
                    infoHeight
            );


        boxBg.addColorStop(
            0,
            "rgba(60,8,8,0.88)"
        );

        boxBg.addColorStop(
            1,
            "rgba(35,3,3,0.88)"
        );


        ctx.fillStyle =
            boxBg;


        roundRect(
            ctx,
            x,
            infoY,
            boxWidth,
            infoHeight,
            13
        );

        ctx.fill();


        ctx.strokeStyle =
            "rgba(232,185,75,0.85)";

        ctx.lineWidth =
            1.5;


        roundRect(
            ctx,
            x,
            infoY,
            boxWidth,
            infoHeight,
            13
        );

        ctx.stroke();


        ctx.textAlign =
            "center";


        ctx.font =
            `16px ${REGULAR_FONT}`;

        ctx.fillStyle =
            "#D8B875";

        ctx.fillText(
            title,
            x +
                boxWidth / 2,
            infoY + 30
        );


        ctx.font =
            `33px ${BOLD_FONT}`;

        ctx.fillStyle =
            "#FFF0C2";

        ctx.fillText(
            value,
            x +
                boxWidth / 2,
            infoY + 69
        );


        ctx.textAlign =
            "left";
    }


    drawInfoBox(
        startX,
        "CẤP ĐỘ",
        `${level}`
    );


    drawInfoBox(
        startX +
            boxWidth +
            gap,
        "HẠNG SERVER",
        rank > 0
            ? `#${rank}`
            : "—"
    );


    drawInfoBox(
        startX +
            (
                boxWidth +
                gap
            ) * 2,
        "TỔNG XP",
        Number(
            totalXp
        ).toLocaleString(
            "vi-VN"
        )
    );


    // ========================================
    // PROGRESS BAR
    // ========================================

    const labelX = 55;

    const barX = 235;
    const barY = 392;

    const barWidth =
        740;

    const barHeight =
        25;


    ctx.font =
        `16px ${BOLD_FONT}`;

    ctx.fillStyle =
        "#D8B875";

    ctx.fillText(
        "TIẾN ĐỘ",
        labelX,
        411
    );


    const safeRequiredXp =
        Math.max(
            Number(
                requiredXp
            ) || 1,
            1
        );


    const safeCurrentXp =
        Math.max(
            Number(
                currentXp
            ) || 0,
            0
        );


    const progress =
        Math.max(
            0,
            Math.min(
                1,
                safeCurrentXp /
                    safeRequiredXp
            )
        );


    ctx.fillStyle =
        "rgba(25,2,2,0.85)";


    roundRect(
        ctx,
        barX,
        barY,
        barWidth,
        barHeight,
        13
    );

    ctx.fill();


    ctx.strokeStyle =
        "rgba(232,185,75,0.70)";

    ctx.lineWidth =
        1.4;


    roundRect(
        ctx,
        barX,
        barY,
        barWidth,
        barHeight,
        13
    );

    ctx.stroke();


    if (
        progress > 0
    ) {
        const progressGradient =
            ctx.createLinearGradient(
                barX,
                0,
                barX +
                    barWidth,
                0
            );


        progressGradient
            .addColorStop(
                0,
                "#E6A63C"
            );

        progressGradient
            .addColorStop(
                0.5,
                "#F4C85D"
            );

        progressGradient
            .addColorStop(
                1,
                "#FFE69A"
            );


        ctx.fillStyle =
            progressGradient;


        roundRect(
            ctx,
            barX,
            barY,
            Math.max(
                18,
                barWidth *
                    progress
            ),
            barHeight,
            13
        );

        ctx.fill();
    }


    ctx.textAlign =
        "right";

    ctx.font =
        `19px ${BOLD_FONT}`;

    ctx.fillStyle =
        "#FFF0C2";


    ctx.fillText(
        `${safeCurrentXp.toLocaleString("vi-VN")} / ${safeRequiredXp.toLocaleString("vi-VN")} XP`,
        1145,
        412
    );


    ctx.textAlign =
        "left";


    return canvas.toBuffer(
        "image/png"
    );
}


module.exports = {
    createRankCard
};
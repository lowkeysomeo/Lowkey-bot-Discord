const fs = require("node:fs");

const {
    createCanvas,
    loadImage,
    GlobalFonts
} = require("@napi-rs/canvas");


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
        } catch {}
    }
}

loadFonts();


const REGULAR_FONT =
    '"VNL", "DejaVu Sans", Arial, sans-serif';

const BOLD_FONT =
    '"VNL Bold", "DejaVu Sans", Arial, sans-serif';


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


function drawStar(
    ctx,
    cx,
    cy,
    outerRadius,
    innerRadius
) {
    let rotation =
        -Math.PI / 2;

    ctx.beginPath();

    for (
        let i = 0;
        i < 10;
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
            Math.PI / 5;
    }

    ctx.closePath();
}


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
                .width <=
            maxWidth
        ) {
            break;
        }

        size -= 2;
    }

    return size;
}


async function createVoiceRankCard(
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
        requiredXp,
        minutes
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


    // Background
    const bg =
        ctx.createLinearGradient(
            0,
            0,
            width,
            height
        );

    bg.addColorStop(
        0,
        "#310404"
    );

    bg.addColorStop(
        0.35,
        "#680707"
    );

    bg.addColorStop(
        0.7,
        "#8E0C0C"
    );

    bg.addColorStop(
        1,
        "#3A0303"
    );

    ctx.fillStyle = bg;

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // Glow
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
        "rgba(220,50,30,0.32)"
    );

    glow.addColorStop(
        1,
        "rgba(100,0,0,0)"
    );

    ctx.fillStyle =
        glow;

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // Star
    ctx.save();

    ctx.globalAlpha =
        0.12;

    ctx.fillStyle =
        "#FFD75A";

    drawStar(
        ctx,
        1020,
        150,
        120,
        48
    );

    ctx.fill();

    ctx.restore();


    // Pattern
    ctx.save();

    ctx.globalAlpha =
        0.07;

    ctx.strokeStyle =
        "#FFD75A";

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


    // Border
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


    // Brand
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
        "VOICE • COMMUNITY • VIETNAM",
        900,
        77
    );


    // Avatar
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


    const avatarSize =
        155;

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


    // Username
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
        "Thành viên Voice VietNam Legacy",
        nameX,
        197
    );


    // Time
    const totalMinutes =
        Number(minutes) || 0;

    const hours =
        Math.floor(
            totalMinutes / 60
        );

    const remainMinutes =
        totalMinutes % 60;


    // Info
    const infoY = 255;

    const infoHeight =
        92;

    const gap = 14;

    const startX = 45;


    const boxWidth =
        (
            width -
            90 -
            gap * 3
        ) / 4;


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
            `15px ${REGULAR_FONT}`;

        ctx.fillStyle =
            "#D8B875";

        ctx.fillText(
            title,
            x +
                boxWidth / 2,
            infoY + 29
        );


        ctx.font =
            `29px ${BOLD_FONT}`;

        ctx.fillStyle =
            "#FFF0C2";

        ctx.fillText(
            value,
            x +
                boxWidth / 2,
            infoY + 67
        );


        ctx.textAlign =
            "left";
    }


    drawInfoBox(
        startX,
        "VOICE LEVEL",
        `${level}`
    );


    drawInfoBox(
        startX +
            boxWidth +
            gap,
        "HẠNG VOICE",
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
        "VOICE XP",
        Number(
            totalXp
        ).toLocaleString(
            "vi-VN"
        )
    );


    drawInfoBox(
        startX +
            (
                boxWidth +
                gap
            ) * 3,
        "THỜI GIAN",
        hours > 0
            ? `${hours}g ${remainMinutes}p`
            : `${remainMinutes} phút`
    );


    // Progress
    const labelX = 45;

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

        progressGradient.addColorStop(
            0,
            "#E6A63C"
        );

        progressGradient.addColorStop(
            0.5,
            "#F4C85D"
        );

        progressGradient.addColorStop(
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
    createVoiceRankCard
};
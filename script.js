const dishes = [
    {
        image: "images/dish-1.png",
        title: "Лангустины",
        price: "830 ₽"
    },
    {
        image: "images/dish-2.png",
        title: "Бокс \"Буйок\"",
        price: "5000 ₽"
    },
    {
        image: "images/dish-3.png",
        title: "Борщ с копчёной вишней",
        price: "570 ₽"
    }
];

/* Gallery */

const gallery = document.querySelector(".gallery");
let current = 0;
const items = [];

dishes.forEach((dish) => {
    const card = document.createElement("div");
    card.classList.add("gallery-item");
    card.innerHTML = `
        <img src="${dish.image}" alt="${dish.title}">
        <div class="dish-info">
            <p class="dish-description">${dish.title}</p>
            <hr style="border: 0.1vw solid black">
            <p class="dish-description">${dish.price}</p>
        </div>
    `;
    gallery.appendChild(card);
    items.push(card);
});

function updateGallery() {
    const left  = (current - 1 + dishes.length) % dishes.length;
    const right = (current + 1) % dishes.length;

    items.forEach((item, index) => {
        item.classList.remove("left", "center", "right", "hidden");

        if (index === left)
            item.classList.add("left");
        else if (index === current)
            item.classList.add("center");
        else if (index === right)
            item.classList.add("right");
        else
            item.classList.add("hidden");
    });
}

updateGallery();

document.querySelector(".next").addEventListener("click", () => {
    current = (current + 1) % dishes.length;
    updateGallery();
});

document.querySelector(".prev").addEventListener("click", () => {
    current = (current - 1 + dishes.length) % dishes.length;
    updateGallery();
});

/* PDF Modal */

const MENU_PDF_PATH = "menu.pdf";
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.25;

/* Build modal DOM */
const overlay = document.createElement("div");
overlay.className = "pdf-overlay";
overlay.innerHTML = `
    <div class="pdf-modal">
        <div class="pdf-toolbar">
            <button class="pdf-zoom-btn" id="zoom-out" aria-label="Уменьшить">&#x2212;</button>
            <span class="pdf-zoom-label" id="zoom-label">100%</span>
            <button class="pdf-zoom-btn" id="zoom-in"  aria-label="Увеличить">&#x2b;</button>
            <button class="pdf-zoom-btn" id="zoom-fit" aria-label="По размеру страницы">&#x2922;</button>
            <button class="pdf-close" id="pdf-close" aria-label="Закрыть меню">&#x2715;</button>
        </div>
        <div class="pdf-canvas-scroll" id="pdf-canvas-scroll">
            <div class="pdf-canvas-wrap" id="pdf-canvas-wrap"></div>
        </div>
    </div>
`;
document.body.appendChild(overlay);

const canvasWrap = overlay.querySelector("#pdf-canvas-wrap");
const canvasScroll = overlay.querySelector("#pdf-canvas-scroll");
const zoomLabel = overlay.querySelector("#zoom-label");
const closeBtn = overlay.querySelector("#pdf-close");
const zoomInBtn = overlay.querySelector("#zoom-in");
const zoomOutBtn = overlay.querySelector("#zoom-out");
const zoomFitBtn = overlay.querySelector("#zoom-fit");

/* State */
let pdfDoc = null;
let baseScale = 1.0;
let scale = 1.0;
let renderQueue = Promise.resolve();
let pdfLoaded = false;

/* Helpers */
function setZoomLabel() {
    zoomLabel.textContent = Math.round(scale * 100) + "%";
}

function clampScale(val) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, val));
}

function computeFitScale(page) {
    const viewport = page.getViewport({ scale: 1.0 });
    const scrollRect = canvasScroll.getBoundingClientRect();
    const availW = scrollRect.width - 32;
    const availH = scrollRect.height - 40;
    const fitW = availW / viewport.width;
    const fitH = availH / viewport.height;
    return Math.min(fitW, fitH, ZOOM_MAX);
}

/* Render all pages at current scale */
async function renderAllPages() {
    if (!pdfDoc)
        return;

    canvasWrap.innerHTML = "";

    const promises = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const canvas = document.createElement("canvas");
        canvas.className = "pdf-page-canvas";
        canvasWrap.appendChild(canvas);

        promises.push(
            pdfDoc.getPage(pageNum).then((page) => {
                const viewport = page.getViewport({ scale });
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.floor(viewport.width * dpr);
                canvas.height = Math.floor(viewport.height * dpr);
                canvas.style.width = Math.floor(viewport.width) + "px";
                canvas.style.height = Math.floor(viewport.height) + "px";

                const ctx = canvas.getContext("2d");
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

                return page.render({
                    canvasContext: ctx,
                    viewport
                }).promise;
            })
        );
    }

    await Promise.all(promises);
}

/* Zoom */
function applyZoom(newScale) {
    const prev = scale;
    scale = clampScale(newScale);
    const ratio = scale / prev;
    const scrollTop = canvasScroll.scrollTop;
    const scrollLeft = canvasScroll.scrollLeft;

    setZoomLabel();

    renderQueue = renderQueue.then(() => renderAllPages()).then(() => {
        canvasScroll.scrollTop = scrollTop * ratio;
        canvasScroll.scrollLeft = scrollLeft * ratio;
    });

    zoomOutBtn.disabled = scale <= ZOOM_MIN;
    zoomInBtn.disabled = scale >= ZOOM_MAX;
}

function fitToPage() {
    if (!pdfDoc)
        return;
    pdfDoc.getPage(1).then((page) => {
        const fit = computeFitScale(page);
        applyZoom(fit);
    });
}

zoomInBtn.addEventListener("click",  () => applyZoom(scale + ZOOM_STEP));
zoomOutBtn.addEventListener("click", () => applyZoom(scale - ZOOM_STEP));
zoomFitBtn.addEventListener("click", fitToPage);

/* Ctrl/Cmd + scroll wheel zoom */
canvasScroll.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey)
        return;
    e.preventDefault();
    applyZoom(scale + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
}, { passive: false });

/* Pinch-to-zoom (touch) */
let pinchStartDist = 0;
let pinchStartScale = 1;

function getTouchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

canvasScroll.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
        pinchStartScale = scale;
    }
}, { passive: false });

canvasScroll.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        const ratio = dist / pinchStartDist;
        applyZoom(pinchStartScale * ratio);
    }
}, { passive: false });

canvasScroll.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) {
        pinchStartDist = 0;
    }
}, { passive: true });

/* Open / close */
async function openMenu() {
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";

    if (pdfLoaded) {
        canvasScroll.scrollTop = 0;
        return;
    }

    const pdfjsLib = await import(PDFJS_CDN);
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    pdfDoc = await pdfjsLib.getDocument(MENU_PDF_PATH).promise;
    pdfLoaded = true;

    const firstPage = await pdfDoc.getPage(1);
    baseScale = computeFitScale(firstPage);
    scale = baseScale;

    setZoomLabel();
    await renderAllPages();
}

function closeMenu() {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
}

document.querySelector(".open-menu").addEventListener("click", openMenu);
closeBtn.addEventListener("click", closeMenu);

overlay.addEventListener("click", (e) => {
    if (e.target === overlay)
        closeMenu();
});

document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("active"))
        return;
    if (e.key === "Escape")
        closeMenu();
    if (e.key === "+" || e.key === "=")
        applyZoom(scale + ZOOM_STEP);
    if (e.key === "-")
        applyZoom(scale - ZOOM_STEP);
    if (e.key === "0")
        fitToPage();
});

window.addEventListener("resize", () => {
    if (overlay.classList.contains("active") && pdfDoc) {
        pdfDoc.getPage(1).then((page) => {
            baseScale = computeFitScale(page);
        });
    }
});

const galleryContainer = document.querySelector(".photo-gallery-container");
const photoCards = galleryContainer.querySelectorAll(".card");

photoCards.forEach(card => card.classList.add("is-active"));

galleryContainer.addEventListener("mouseenter", (event) => {
    const card = event.target.closest(".card");
    if (card) {
        photoCards.forEach(c => c.classList.remove("is-active"));
        card.classList.add("is-active");
    }
}, true);

galleryContainer.addEventListener("mouseleave", (event) => {
    const card = event.target.closest(".card");
    if (card) {
        photoCards.forEach(c => c.classList.add("is-active"));
    }
}, true);

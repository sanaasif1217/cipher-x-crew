/**
 * Knowledge base for the Research Assistant.
 *
 * Every chunk is drawn from this project's own documents: the README,
 * the backend methodology, the pack manifests, and the challenge brief.
 * The assistant answers ONLY from these chunks and cites the source of
 * each answer; when nothing matches well enough it says so.
 */

export interface KnowledgeChunk {
  id: string;
  title: string;
  source: string;
  text: string;
}

export const KNOWLEDGE: KnowledgeChunk[] = [
  {
    id: 'project-overview',
    title: 'What this project is',
    source: 'README — project overview',
    text: 'Watch the Sky Change is a web tool built by Cipher-X Crew for the NASA Space Apps Challenge brief "NASA SPHEREx and Planet X". It makes it easy for anyone to see how a patch of sky changes over time. An interactive workbench visualizes how each benchmark target moves and varies, and the Real Frames section plays actual SPHEREx survey images retrieved from the NASA IRSA archive, then lets you measure, difference and compare them.',
  },
  {
    id: 'spherex-mission',
    title: 'The SPHEREx mission',
    source: 'Challenge brief — mission background',
    text: 'SPHEREx is a NASA space telescope launched in March 2025. It is surveying the entire sky in near-infrared light, in 102 spectral colour bands, and it re-images the whole sky again and again over its mission. Because the same regions are observed repeatedly at different times, objects that move or change brightness can be spotted by comparing observations across epochs. Its data is archived publicly at the NASA/IPAC Infrared Science Archive, IRSA.',
  },
  {
    id: 'planet-x',
    title: 'Planet X and why repeated images matter',
    source: 'Challenge brief — Planet X',
    text: 'Planet X is a hypothesized, still-undiscovered planet far beyond Neptune. Its gravity could explain the clustered orbits of some distant Kuiper Belt objects. If it exists, Planet X would be faint and extremely slow-moving — shifting by only arcseconds per day — so finding it means comparing images of the same sky taken months apart and looking for the one point of light that moved. Repeated all-sky surveys like SPHEREx, combined with techniques such as difference imaging, are exactly the kind of data such a search needs.',
  },
  {
    id: 'real-frames',
    title: 'The Real Frames viewer',
    source: 'README — What\'s real here',
    text: 'The Real Frames section plays actual SPHEREx level-2 survey images — no simulated imagery. Six targets have data packs of 12 real frames each, stored in this repository under backend/static_data. The website loads the packs directly, so the frames play on any hosting with no server required. Every frame carries its observation time in UTC, its detector, and its wavelength band, exactly as the archive reports them in the pack manifest.',
  },
  {
    id: 'pack-method',
    title: 'How the data packs are made',
    source: 'README — Methodology',
    text: 'The Python backend makes each pack in five steps. First it queries the IRSA TAP service, the spherex.obscore table, for level-2 SPHEREx images whose footprint contains the target coordinates, and counts every epoch the archive holds. Then it downloads 0.5 by 0.5 degree cutouts for a 12-frame sample spread across that coverage, through the IRSA IBE and DataLink services. Each cutout is reprojected onto one common world coordinate grid so the frames line up exactly. A shared background level is removed and one global brightness stretch is applied to the whole series, so frames stay comparable. Finally the frames are rendered as 900 by 900 PNGs next to a manifest.json recording each frame\'s UTC, observation ID, detector and wavelength band.',
  },
  {
    id: 'epoch-explorer',
    title: 'Epoch Explorer',
    source: 'Site — Real Data section',
    text: 'The Epoch Explorer is a table of every frame in the selected target\'s data pack. Each row gives the frame\'s observation time in UTC, the SPHEREx detector that recorded it, the wavelength band in microns, and the archive observation ID. The table can be filtered by detector, and clicking any row jumps the frame viewer straight to that frame. The header also shows how many epochs the archive holds on that field in total, and the date span the pack covers.',
  },
  {
    id: 'brightness-analytics',
    title: 'Brightness Analytics',
    source: 'Site — Real Data section',
    text: 'Brightness Analytics measures the real frames in your browser. For each frame it computes the mean pixel value, and charts how that brightness changes from the first frame to the last, including the percentage change. Clicking a point on the chart jumps the viewer to that frame. It is a quick way to see variability quantitatively instead of only by eye. The measurement is a mean pixel value of the displayed frames, not calibrated photometry.',
  },
  {
    id: 'difference-view',
    title: 'Difference view and difference imaging',
    source: 'Site — Real Data section',
    text: 'The difference view subtracts frame 1 from the frame you are looking at and amplifies the result three times. Anything that stayed perfectly still, like ordinary stars, cancels out and vanishes. Anything that moved or changed brightness remains visible. This is difference imaging, the classic technique for finding moving objects such as asteroids, comets and distant planets: compare two epochs of the same sky and keep only what changed. On the 3I/ATLAS pack you can watch the comet leave a trail of change across a single morning.',
  },
  {
    id: 'compare-mode',
    title: 'Compare mode',
    source: 'Site — Real Data section',
    text: 'Compare mode puts any two targets side by side on a shared frame slider: their real frames, their brightness curves, the number of epochs the archive holds for each, their pack date spans, and their first-to-last brightness change. It is useful for contrasting, for example, the deep 1,258-epoch coverage of R Draconis with the fast-moving comet 3I/ATLAS.',
  },
  {
    id: 'target-comet',
    title: 'Target: 3I/ATLAS, the interstellar comet',
    source: 'Backend manifest — 3i-atlas pack',
    text: '3I/ATLAS is an interstellar comet visiting our Solar System. Its data pack holds 12 real SPHEREx frames from a single morning, 14 December 2025, as it crossed the detector array, sampled from the 184 epochs the archive holds on its field. It is the project\'s moving-object example: in the difference view its motion across the morning is unmistakable.',
  },
  {
    id: 'target-barnards',
    title: 'Target: Barnard\'s Star',
    source: 'Backend manifest — barnards-star pack',
    text: 'Barnard\'s Star is a nearby red dwarf famous for the largest known proper motion of any star, about 10.4 arcseconds per year. The archive holds 183 SPHEREx epochs on its field, and its pack shows 12 real frames sampled from that coverage.',
  },
  {
    id: 'target-epsilon',
    title: 'Target: Epsilon Indi',
    source: 'Backend manifest — epsilon-indi pack',
    text: 'Epsilon Indi is a nearby K-type star with a pair of brown dwarf companions. The archive holds 238 SPHEREx epochs on its field, and its pack shows 12 real frames sampled from that coverage.',
  },
  {
    id: 'target-wise',
    title: 'Target: WISE 0855',
    source: 'Backend manifest — wise-0855 pack',
    text: 'WISE 0855 is one of the coldest known brown dwarfs, about 7.2 light-years away, with a temperature of only a few hundred kelvin. It is faint and fast-moving. The archive holds 129 SPHEREx epochs on its field, and its pack shows 12 real frames sampled from that coverage.',
  },
  {
    id: 'target-rw',
    title: 'Target: RW Aurigae',
    source: 'Backend manifest — rw-aurigae pack',
    text: 'RW Aurigae is a young star known for dramatic dimming events, likely caused by dust structures passing in front of it. The archive holds 168 SPHEREx epochs on its field, and its pack shows 12 real frames sampled from that coverage.',
  },
  {
    id: 'target-rdraconis',
    title: 'Target: R Draconis',
    source: 'Backend manifest — r-draconis pack',
    text: 'R Draconis is a pulsating red giant variable star. It has the deepest archive coverage of the five benchmark targets: the archive holds 1,258 SPHEREx epochs on its field, and its pack shows 12 real frames sampled from that coverage.',
  },
  {
    id: 'coordinates-backend',
    title: 'Viewing a patch that has no pack yet',
    source: 'README — backend API',
    text: 'The backend can generate a frame pack for any coordinates, not just the six prepared targets. Its API endpoint GET /api/patch takes ra and dec parameters and builds a pack for that patch of sky from the archive. Generating new packs from inside the hosted web page is future work, because it needs the backend running as a public service; the prepared packs are what the live site plays.',
  },
  {
    id: 'workbench-vs-real',
    title: 'Workbench visualizations vs real data',
    source: 'README — honesty note',
    text: 'The site has two kinds of content, and it labels them honestly. The motion workbench and the explorer gallery visualize each target\'s known motion and variability — proper motion, orbital motion, pulsation, occultation dips — as an interactive presentation. The Real Frames section is different: it shows genuine archive images with their real observation metadata, and the Research Assistant answers from the project\'s documents. Only the Real Frames data is archive imagery.',
  },
  {
    id: 'limitations',
    title: 'Limitations',
    source: 'README — Limitations',
    text: 'The project is honest about its limits. Each pack shows 12 sampled frames, not the full epoch series, chosen so the site stays fast; the archive totals run up to 1,258 epochs. New coordinates can be turned into packs by the backend but not yet from inside the hosted page. Frames are single-band level-2 images rendered with a shared stretch; they are for watching change, and the brightness chart is a mean pixel value, not calibrated photometry. The workbench sections are visualizations of known behaviour, not archive data.',
  },
  {
    id: 'tech-stack',
    title: 'Tech stack',
    source: 'README — tech stack',
    text: 'The frontend is React with TypeScript, built with Vite and styled with Tailwind CSS. The 3D starfield journey and scroll animations use Three.js and GSAP. The backend is Python: FastAPI with Astropy and pyvo to query and retrieve SPHEREx data from NASA\'s IRSA archive, reproject for image registration, and NumPy and Pillow to render the frames. The site is hosted as a static build; the data packs live in the same GitHub repository.',
  },
  {
    id: 'team',
    title: 'The team',
    source: 'README — Team responsibilities',
    text: 'Cipher-X Crew has six members from two countries, Pakistan and India. Sana Asif is the Team Leader, responsible for project direction, the real-data backend and data packs, and the repository. Sujal Khanolkar is responsible for the website design and frontend experience. Sherdil Khan, Naheed Nawaz, Abdul Qadoos and Abdullah are Team Members.',
  },
  {
    id: 'data-sources',
    title: 'Data sources',
    source: 'README — Data sources',
    text: 'All imagery comes from the NASA/IPAC Infrared Science Archive, IRSA: the SPHEREx level-2 data collection, queried through the TAP table spherex.obscore, with cutouts delivered through the IBE and DataLink services. Frame metadata — UTC, observation ID, detector and wavelength band — is taken from the archive manifests unchanged. Nothing in a data pack is simulated or hand-drawn.',
  },
];

export const SUGGESTED_QUESTIONS: string[] = [
  'How were the data packs made?',
  'What is difference imaging?',
  'How many epochs does the archive hold for R Draconis?',
  'What are the project\'s limitations?',
  'Why do repeated SPHEREx images help the Planet X search?',
  'Tell me about the comet 3I/ATLAS',
];

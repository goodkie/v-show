/**
 * dn'a Virtual Trade Show Commercial Platform
 * Canonical Global Product Registry (Phase dn'a-C04)
 * Shared across 3D WebGL Showroom, Immersive 360° Studio, Product Drawers, QR Passes, RFQs, and Catalog.
 */

const DNA_CANONICAL_PRODUCTS = {
  'apex-cobot-x16': {
    id: 'apex-cobot-x16',
    alias: 'cobot',
    name: 'Apex Cobot X16',
    model: 'APX-CB-16',
    category: 'Collaborative Robotics',
    badge: 'COLLABORATIVE ROBOTICS',
    tagline: '6-Axis Precision Collaborative Industrial Arm',
    description: 'A 6-axis collaborative robot arm engineered for precision assembly, pick-and-place, and machine-tending tasks in shared human-robot workspaces. Features integrated force-torque sensing and ISO/TS 15066 safety compliance.',
    specs: [
      { label: 'Payload Capacity', value: '16.0 kg Payload' },
      { label: 'Working Radius', value: '1,300 mm Reach' },
      { label: 'Repeatability', value: '±0.025 mm Repeatability' },
      { label: 'Drive Power', value: '48V DC / 650W Max' },
      { label: 'Joint Velocity', value: 'Up to 250°/s' },
      { label: 'Protection Rating', value: 'IP67 Sealed Joints' },
      { label: 'Interface', value: 'EtherCAT / PROFINET / ROS2' }
    ],
    vantagePoint: { x: 0, y: 1.6, z: 2.4, target: { x: 0, y: 1.1, z: 0 } },
    hotspotCoords: { x: 0.05, y: 1.35, z: -0.1 },
    radarCoords: { x: 50, y: 48 },
    thumbUrl: '/assets/brand/dna-showcase/apex_cobot_x16_thumb.png',
    photoUrl: '/assets/brand/dna-showcase/apex_cobot_x16.png',
    pdfUrl: '/assets/specs/Apex-Cobot-X16-Datasheet.pdf',
    priceRange: '$38,500 – $42,000'
  },
  'vector-amr-600': {
    id: 'vector-amr-600',
    alias: 'amr',
    name: 'Vector AMR 600',
    model: 'VCT-AMR-600',
    category: 'Autonomous Logistics',
    badge: 'AUTONOMOUS INTRALOGISTICS',
    tagline: 'Heavy-Payload Warehouse Intralogistics AMR',
    description: 'Fleet-ready autonomous mobile robot platform with 3D LiDAR SLAM navigation, dual safety laser scanners, dynamic obstacle avoidance, and automatic inductive opportunity charging for continuous 24/7 factory intralogistics.',
    specs: [
      { label: 'Payload Capacity', value: '600 kg Max Payload' },
      { label: 'Navigation System', value: '3D LiDAR SLAM + Vision' },
      { label: 'Max Travel Speed', value: '2.0 m/s (7.2 km/h)' },
      { label: 'Battery Runtime', value: '10 hrs continuous / Auto-dock' },
      { label: 'Safety Standard', value: 'ISO 3691-4 / CE Compliant' },
      { label: 'Turning Radius', value: 'Zero-turn differential drive' },
      { label: 'Communication', value: 'Industrial Wi-Fi 6 / 5G Ready' }
    ],
    vantagePoint: { x: -3.2, y: 1.5, z: 2.0, target: { x: -2.8, y: 0.7, z: 0 } },
    hotspotCoords: { x: -2.8, y: 0.85, z: 0.1 },
    radarCoords: { x: 22, y: 55 },
    thumbUrl: '/assets/brand/dna-showcase/vector_amr_600_thumb.png',
    photoUrl: '/assets/brand/dna-showcase/vector_amr_600.png',
    pdfUrl: '/assets/specs/Vector-AMR-600-Datasheet.pdf',
    priceRange: '$34,000 – $39,500'
  },
  'titan-delta-d12': {
    id: 'titan-delta-d12',
    alias: 'delta',
    name: 'Titan Delta D12',
    model: 'TTN-DLT-12',
    category: 'High-Speed Packaging',
    badge: 'HIGH-SPEED PACKAGING',
    tagline: 'High-Speed Parallel Delta Robot for Packaging',
    description: 'High-speed parallel kinematic delta robot designed for rapid pick-and-place, secondary packaging, sorting, and food/pharma handling. Capable of up to 240 picks per minute with visual tracking and conveyor synchronization.',
    specs: [
      { label: 'Pick Rate', value: '240 Picks / min' },
      { label: 'Payload Capacity', value: '12.0 kg Rated' },
      { label: 'Working Envelope', value: '1,200 mm Diameter × 400 mm' },
      { label: 'Repeatability', value: '±0.05 mm' },
      { label: 'Vision Guidance', value: 'Integrated 2D/3D Fast Vision' },
      { label: 'Material Grade', value: 'Washdown Stainless / Carbon Fiber' },
      { label: 'Kinematics', value: 'Parallel 4-Axis Delta' }
    ],
    vantagePoint: { x: 3.2, y: 1.7, z: 2.0, target: { x: 2.8, y: 1.2, z: 0 } },
    hotspotCoords: { x: 2.8, y: 1.3, z: 0 },
    radarCoords: { x: 78, y: 55 },
    thumbUrl: '/assets/brand/dna-showcase/titan_delta_d12_thumb.png',
    photoUrl: '/assets/brand/dna-showcase/titan_delta_d12.png',
    pdfUrl: '/assets/specs/Titan-Delta-D12-Datasheet.pdf',
    priceRange: '$29,000 – $34,500'
  },
  'hyperion-scara-s8': {
    id: 'hyperion-scara-s8',
    alias: 'scara',
    name: 'Hyperion SCARA S8',
    model: 'HYP-SCR-08',
    category: 'Precision Assembly',
    badge: 'PRECISION ASSEMBLY',
    tagline: 'Ultra-Fast Precision 4-Axis SCARA Manipulator',
    description: 'Ultra-high-speed 4-axis SCARA manipulator engineered for compact electronic assembly, screw driving, PCB testing, and precision dispensing. Delivers benchmark 0.32-second standard cycle times with sub-hundredth repeatability.',
    specs: [
      { label: 'Standard Cycle', value: '0.32 s (1kg cycle)' },
      { label: 'Arm Reach', value: '800 mm Total Span' },
      { label: 'Payload Capacity', value: '8.0 kg Max' },
      { label: 'Repeatability (XY)', value: '±0.010 mm' },
      { label: 'Z-Stroke', value: '200 mm High-Speed' },
      { label: 'Controller', value: 'Multi-Axis Integrated Motion IPC' },
      { label: 'Mounting', value: 'Floor / Wall / Inverted' }
    ],
    vantagePoint: { x: -1.8, y: 1.8, z: 2.2, target: { x: -1.6, y: 1.3, z: -0.5 } },
    hotspotCoords: { x: -1.6, y: 1.45, z: -0.5 },
    radarCoords: { x: 35, y: 35 },
    thumbUrl: '/assets/brand/dna-showcase/hyperion_scara_s8_thumb.png',
    photoUrl: '/assets/brand/dna-showcase/hyperion_scara_s8.png',
    pdfUrl: '/assets/specs/Hyperion-SCARA-S8-Datasheet.pdf',
    priceRange: '$22,500 – $26,000'
  }
};

const DNA_PRODUCT_LIST = Object.values(DNA_CANONICAL_PRODUCTS);

// Node.js / CommonJS export support
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DNA_CANONICAL_PRODUCTS, DNA_PRODUCT_LIST };
}

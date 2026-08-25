const fs = require('fs');
const path = require('path');

const specsDir = 'E:/vivpr/ai/v-show/virtual-tradeshow-commercial-v1/app_build/client/assets/specs';
fs.mkdirSync(specsDir, { recursive: true });

function createSimplePDF(title, model, category, specs) {
  const content = [
    `%PDF-1.4`,
    `1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj`,
    `2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj`,
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj`,
    `5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj`,
    `6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`
  ];

  let stream = `BT\n/F1 20 Tf\n50 730 Td\n(dna INDUSTRIAL AUTOMATION SHOWCASE) Tj\n`;
  stream += `/F2 10 Tf\n0 -20 Td\n(DEMO PRODUCT / SAMPLE SPECIFICATION SHEET) Tj\n`;
  stream += `/F1 16 Tf\n0 -35 Td\n(${title.replace(/[\(\)]/g, '')}) Tj\n`;
  stream += `/F2 11 Tf\n0 -18 Td\n(Model: ${model}  |  Category: ${category}) Tj\n`;
  stream += `/F1 12 Tf\n0 -30 Td\n(TECHNICAL SPECIFICATIONS & RATINGS:) Tj\n`;
  stream += `/F2 10 Tf\n`;

  specs.forEach(s => {
    stream += `0 -18 Td\n(- ${s.name.replace(/[\(\)]/g, '')}: ${s.value.replace(/[\(\)]/g, '')}) Tj\n`;
  });

  stream += `0 -40 Td\n(/F1 11 Tf\n(COMMERCIAL INFORMATION:) Tj\n`;
  stream += `/F2 10 Tf\n0 -18 Td\n(- Lead Time: 2 to 4 Weeks Ex-Works) Tj\n`;
  stream += `0 -16 Td\n(- Warranty: 24 Months Comprehensive Manufacturer Warranty) Tj\n`;
  stream += `0 -16 Td\n(- Compliance: CE, UL, RoHS, ISO 9001:2015 Certified) Tj\n`;
  stream += `0 -40 Td\n(/F2 8 Tf\n(Notice: This document is provided for demonstration purposes in the dna Virtual Trade Show platform.) Tj\n`;
  stream += `ET`;

  const streamObj = `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj`;
  content.push(streamObj);
  content.push(`xref\n0 7\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000300 00000 n \n0000000210 00000 n \n0000000255 00000 n \ntrailer << /Size 7 /Root 1 0 R >>\nstartxref\n${content.join('\n').length}\n%%EOF`);

  return content.join('\n');
}

const products = [
  {
    file: 'Apex-Cobot-X16-Datasheet.pdf',
    title: 'Apex Cobot X16 Collaborative Robotic Arm',
    model: 'APX-CB-16',
    category: 'Industrial Robotics & Manipulation',
    specs: [
      { name: 'Payload Capacity', value: '16.0 kg at full extension' },
      { name: 'Working Radius / Reach', value: '1300 mm spherical envelope' },
      { name: 'Repeatability', value: '+/- 0.03 mm ISO 9283' },
      { name: 'Degrees of Freedom', value: '6 Rotating Articulated Joints' },
      { name: 'Joint Speed', value: 'Up to 180 deg/sec' },
      { name: 'Safety Certification', value: 'ISO 10218-1, ISO/TS 15066 PLd Cat. 3' },
      { name: 'Tool I/O Flange', value: 'RS485, 2x Digital In, 2x Digital Out, 24V 2A' },
      { name: 'Ingress Protection', value: 'IP54 (Tool Flange IP67 Optional)' }
    ]
  },
  {
    file: 'Vector-AMR-600-Datasheet.pdf',
    title: 'Vector AMR 600 Autonomous Mobile Robot',
    model: 'VCT-AMR-600',
    category: 'Autonomous Intralogistics',
    specs: [
      { name: 'Payload Capacity', value: '600 kg on top mounting deck' },
      { name: 'Max Speed', value: '2.0 m/s with intelligent payload derating' },
      { name: 'Navigation Principle', value: 'Natural Feature 360 LiDAR SLAM' },
      { name: 'Battery Run Time', value: 'Up to 10 Hours continuous operation' },
      { name: 'Fast Charge Time', value: '80% charge in 45 minutes via dock' },
      { name: 'Safety Field Sensors', value: 'Dual 270 deg Safety Lasers (SIL 2/PLd)' },
      { name: 'Fleet Software Protocol', value: 'VDA 5050 standard REST/MQTT API' }
    ]
  },
  {
    file: 'OptiScan-V3-Datasheet.pdf',
    title: 'OptiScan V3 Industrial 3D Inspection Camera',
    model: 'OPT-SCN-V3',
    category: 'Industrial Metrology & Quality Vision',
    specs: [
      { name: 'Measurement Accuracy', value: '+/- 3.5 microns' },
      { name: 'Projection Technology', value: 'High-power 450nm Blue LED Fringe' },
      { name: 'Camera Resolution', value: 'Dual 12.0 Megapixel Global Shutter' },
      { name: 'Capture Rate', value: 'Up to 140 full 3D point clouds/second' },
      { name: 'Field of View (FOV)', value: '350 x 240 x 180 mm' },
      { name: 'Interface', value: '10 Gigabit Ethernet (10GBASE-T) Vision' }
    ]
  },
  {
    file: 'FlexGrip-E80-Datasheet.pdf',
    title: 'FlexGrip E80 Servo Adaptive Gripper',
    model: 'FLX-GRP-80',
    category: 'Robotic End-of-Arm Tooling',
    specs: [
      { name: 'Gripping Force Range', value: '20 N to 220 N fully programmable' },
      { name: 'Total Stroke Length', value: '80 mm (40 mm per parallel finger)' },
      { name: 'Positioning Precision', value: '+/- 0.02 mm' },
      { name: 'Grip Cycle Time', value: '0.18 seconds full stroke' },
      { name: 'Communication Bus', value: 'IO-Link / Modbus RTU / EtherCAT' },
      { name: 'Weight', value: '1.15 kg lightweight aluminum alloy housing' }
    ]
  }
];

products.forEach(p => {
  const pdfContent = createSimplePDF(p.title, p.model, p.category, p.specs);
  fs.writeFileSync(path.join(specsDir, p.file), pdfContent, 'binary');
  console.log(`[SPEC_PDF] ${p.file} generated (${pdfContent.length} bytes)`);
});

console.log('All 4 commercial spec PDFs created successfully.');

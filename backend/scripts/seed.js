/**
 * Seeds one sample mapping and two sample messages for a fresh `config-service` DB.
 *
 * Documents use the same shape as the existing production data:
 *   hl7-mapping:      { name, type, direction, hl7Mappings: [{ segment, field, variable, value?, description? }] }
 *   hl7-test-message: { name, message }
 *
 * Idempotent: documents are upserted by `name`, so re-running never duplicates
 * and never touches other documents.
 *
 * Usage: npm run seed            (uses the root .env)
 *        DB_NAME=other npm run seed
 */
require('../../scripts/load-env');
const { connect, disconnect, collection, COLLECTIONS } = require('../src/config/db');

const now = new Date();

const m = (segment, field, variable, extra = {}) => ({ segment, field, variable, ...extra });

const mapping = {
  name: 'EMR Orders - ORM',
  type: 'ORM',
  direction: 'in',
  hl7Mappings: [
    m('MSH', '3.1', 'HDR.SENDER_APP', { description: 'Sending Application' }),
    m('MSH', '4.1', 'HDR.SENDER_FAC', { description: 'Sending Facility' }),
    m('MSH', '5.1', 'HDR.RECEIVER_APP'),
    m('MSH', '6.1', 'HDR.RECEIVER_FAC'),
    m('MSH', '7.1', 'HDR.SENT_DATE'),
    m('MSH', '9.1', 'HDR.MSG_TYPE', { value: 'ORM', description: 'Message Type' }),
    m('MSH', '9.2', 'HDR.MSG_EVENT', { value: 'O01' }),
    m('MSH', '10.1', 'HDR.CONTROL_ID'),
    m('MSH', '12.1', 'HDR.VERSION_ID', { value: '2.3' }),
    m('PID', '3.1', 'PAT.ID_LIST'),
    m('PID', '5.1', 'PAT.LNAME'),
    m('PID', '5.2', 'PAT.FNAME'),
    m('PID', '5.1', 'PAT.FULL_NAME'),
    m('PID', '5.2', 'PAT.FULL_NAME'),
    m('PID', '7.1', 'PAT.DOB'),
    m('PID', '8.1', 'PAT.SEX'),
    m('PID', '11.1', 'PAT.ADDRESS1'),
    m('PID', '11.3', 'PAT.CITY'),
    m('PID', '11.4', 'PAT.STATE'),
    m('PID', '11.5', 'PAT.ZIP'),
    m('IN1', '3.1', 'IN1.COMPANY_ID'),
    m('IN1', '4.1', 'IN1.COMPANY_NAME'),
    m('IN1', '36.1', 'IN1.POLICY_NUMBER'),
    m('GT1', '3.1', 'GT1.GUARANTOR_FAMILY_NAME'),
    m('GT1', '3.2', 'GT1.GUARANTOR_GIVEN_NAME'),
    m('PV1', '2.1', 'VISIT.PATIENT_CLASS'),
    m('PV1', '19.1', 'VISIT.ACCOUNT_NUMBER'),
    m('ORC', '1.1', 'ORD.ORDER_CONTROL', { value: 'NW' }),
    m('ORC', '2.1', 'ORD.PLACER_ORDER_NUMBER'),
    m('ORC', '12.1', 'ORD.ORDERING_PHY_CODE'),
    m('OBR', '16.1', 'ORD.ORDERING_PHY_CODE'),
    m('OBR', '4.1', 'TST.SRC_CODE'),
    m('OBR', '4.2', 'TST.SRC_NAME'),
    m('OBX', '3.1', 'OBX.QUESTION_CODE'),
    m('OBX', '5.1', 'OBX.ANSWER_VALUE'),
    m('DG1', '3.1', 'DIA.CODE'),
    m('DG1', '2.1', 'DIA.CODING_METHOD', { value: 'I10' }),
  ],
};

const sampleMessage = [
  'MSH|^~\\&|EMRLINK|80393|BEAKER|SRLNEW|20260202072255||ORM^O01|117899620260202072255|P|2.3',
  'PID|1||764585^^^2&MRN&ISO||DOE^JOHN^Q||19800101|M|||12 Main St^^Norfolk^VA^23507',
  'PV1|1|O|||||1275506123^Griffin^Judi|||||||||||NF|10000000000',
  'GT1|1||DOE^JOHN||12 Main St^^Norfolk^VA^23507',
  'IN1|1|00200|00055000200|Aetna \\T\\ Co|PO BOX 981107^^EL PASO^TX^79998',
  'ORC|NW|2026894000001^LTAYLR01|||IP||||20260202072255|||1275506123^Griffin^Judi',
  'OBR|1|2026894000001||LAB01^SPECIMEN FOR PATHOLOGY - OTHER^HCS|||20260202072255||||||||||1275506123^Griffin^Judi',
  'OBX|1|ST|SRC^Source||Clean Catch Urine',
  'OBX|2|ST|131258^Clinical History||Hematuria',
  'DG1|1|I10|R31.29|Other microscopic hematuria',
].join('\r');

const messages = [
  { name: 'Sample', message: sampleMessage },
  { name: 'Sample (alt patient)', message: sampleMessage.replace('DOE^JOHN^Q', 'SMITH^JANE^A').replace(/DOE\^JOHN/g, 'SMITH^JANE') },
];

async function upsertByName(name, docs) {
  let inserted = 0;
  for (const doc of docs) {
    const res = await collection(name).updateOne(
      { name: doc.name },
      { $setOnInsert: { ...doc, createdAt: now, updatedAt: now, __v: 0 } },
      { upsert: true },
    );
    inserted += res.upsertedCount;
  }
  console.log(`[seed] ${name}: ${inserted} inserted, ${docs.length - inserted} already present`);
}

(async () => {
  await connect();
  await upsertByName(COLLECTIONS.mappings, [mapping]);
  await upsertByName(COLLECTIONS.messages, messages);
  await disconnect();
})().catch(async (err) => {
  console.error('[seed] failed:', err);
  await disconnect();
  process.exit(1);
});

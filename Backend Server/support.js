const crypto = require('crypto');
const { adminDb } = require('./supabaseAdmin');

const CATEGORY_VALUES = new Set(['technical', 'billing', 'verification', 'account', 'feedback', 'other']);
const STATUS_VALUES = new Set(['open', 'pending_customer', 'pending_nexus', 'resolved', 'closed']);
const PRIORITY_VALUES = new Set(['low', 'normal', 'high', 'urgent']);

function cleanText(value, max) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeCategory(value) {
  const v = cleanText(value, 32).toLowerCase();
  return CATEGORY_VALUES.has(v) ? v : 'other';
}

function normalizePriority(value) {
  const v = cleanText(value, 16).toLowerCase();
  return PRIORITY_VALUES.has(v) ? v : 'normal';
}

function normalizeStatus(value) {
  const v = cleanText(value, 24).toLowerCase();
  return STATUS_VALUES.has(v) ? v : 'open';
}

function nowIso() { return new Date().toISOString(); }

function ticketRef(ticketId) {
  return adminDb().collection('supportTickets').doc(ticketId);
}

function messageCollection(ticketId) {
  return ticketRef(ticketId).collection('messages');
}

async function createSupportTicket({ workspaceId, uid, email, subject, description, category, priority }) {
  const db = adminDb();
  const ticketId = `tkt_${crypto.randomUUID()}`;
  const now = nowIso();
  const ticket = {
    workspaceId,
    requesterUid: uid,
    requesterEmail: cleanText(email, 254),
    subject: cleanText(subject, 140),
    category: normalizeCategory(category),
    priority: normalizePriority(priority),
    status: 'open',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messageCount: 1,
  };
  if (!ticket.subject || cleanText(description, 6000).length < 10) {
    const error = new Error('Subject and a description of at least 10 characters are required.');
    error.status = 400;
    throw error;
  }
  const batch = db.batch();
  batch.set(ticketRef(ticketId), ticket);
  batch.set(messageCollection(ticketId).doc(`msg_${crypto.randomUUID()}`), {
    authorUid: uid,
    authorType: 'customer',
    body: cleanText(description, 6000),
    createdAt: now,
  });
  await batch.commit();
  return { id: ticketId, ...ticket };
}

async function listCustomerTickets(workspaceId, uid) {
  const snapshot = await adminDb().collection('supportTickets')
    .where('workspaceId', '==', workspaceId)
    .limit(200)
    .get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((ticket) => ticket.requesterUid === uid || ticket.workspaceId === workspaceId)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 100);
}

async function listAdminTickets() {
  const snapshot = await adminDb().collection('supportTickets').limit(500).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 250);
}

async function getTicket(ticketId) {
  const snap = await ticketRef(ticketId).get();
  if (!snap.exists) return null;
  const messages = await messageCollection(ticketId).limit(200).get();
  return {
    id: snap.id,
    ...snap.data(),
    messages: messages.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
  };
}

function assertTicketAccess(ticket, { uid, workspaceId, isAdmin }) {
  if (!ticket) {
    const error = new Error('Support ticket not found.');
    error.status = 404;
    throw error;
  }
  if (isAdmin) return;
  if (!workspaceId || ticket.workspaceId !== workspaceId) {
    const error = new Error('Support ticket access denied.');
    error.status = 403;
    throw error;
  }
  // A workspace member can see workspace support tickets. The ticket requester
  // remains recorded for accountability, but support is a workspace resource.
  return;
}

async function addTicketMessage(ticketId, { uid, authorType, body, status }) {
  const text = cleanText(body, 6000);
  if (text.length < 1) {
    const error = new Error('Reply cannot be empty.');
    error.status = 400;
    throw error;
  }
  const now = nowIso();
  const ref = ticketRef(ticketId);
  const snap = await ref.get();
  if (!snap.exists) {
    const error = new Error('Support ticket not found.');
    error.status = 404;
    throw error;
  }
  const current = snap.data();
  const nextStatus = status ? normalizeStatus(status) : (authorType === 'admin' ? 'pending_customer' : 'pending_nexus');
  await adminDb().runTransaction(async (tx) => {
    tx.set(messageCollection(ticketId).doc(`msg_${crypto.randomUUID()}`), {
      authorUid: uid,
      authorType,
      body: text,
      createdAt: now,
    });
    tx.update(ref, {
      status: nextStatus,
      updatedAt: now,
      lastMessageAt: now,
      lastMessageBy: uid,
      messageCount: Number(current.messageCount || 0) + 1,
    });
  });
  return { status: nextStatus, updatedAt: now };
}

async function updateAdminTicket(ticketId, { status, priority }) {
  const ref = ticketRef(ticketId);
  const snap = await ref.get();
  if (!snap.exists) {
    const error = new Error('Support ticket not found.');
    error.status = 404;
    throw error;
  }
  const patch = { updatedAt: nowIso() };
  if (status !== undefined) patch.status = normalizeStatus(status);
  if (priority !== undefined) patch.priority = normalizePriority(priority);
  await ref.update(patch);
  return { id: ticketId, ...snap.data(), ...patch };
}

async function closeCustomerTicket(ticketId) {
  const ref = ticketRef(ticketId);
  const snap = await ref.get();
  if (!snap.exists) {
    const error = new Error('Support ticket not found.');
    error.status = 404;
    throw error;
  }
  const now = nowIso();
  await ref.update({ status: 'closed', updatedAt: now });
  return { id: ticketId, ...snap.data(), status: 'closed', updatedAt: now };
}

module.exports = {
  createSupportTicket,
  listCustomerTickets,
  listAdminTickets,
  getTicket,
  assertTicketAccess,
  addTicketMessage,
  updateAdminTicket,
  closeCustomerTicket,
  normalizeCategory,
  normalizePriority,
  normalizeStatus,
};

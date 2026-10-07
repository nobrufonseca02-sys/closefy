import assert from "node:assert/strict";
import test from "node:test";
import type { Contact } from "@whiskeysockets/baileys";
import {
  addContacts,
  extractMessage,
  isOneToOneJid,
  resolvePeer,
  type ContactDirectory,
} from "./whatsapp.js";

test("accepts only direct user and LID conversations", () => {
  assert.equal(isOneToOneJid("5521999999999@s.whatsapp.net"), true);
  assert.equal(isOneToOneJid("123456789@lid"), true);
  assert.equal(isOneToOneJid("120363000000@g.us"), false);
  assert.equal(isOneToOneJid("status@broadcast"), false);
});

test("resolves a phone-number JID", () => {
  const directory: ContactDirectory = new Map();
  const peer = resolvePeer("5521999999999@s.whatsapp.net", directory);
  assert.deepEqual(peer, {
    remoteJid: "5521999999999@s.whatsapp.net",
    phone: "+5521999999999",
    displayName: null,
  });
});

test("resolves an anonymous LID through the synced contact directory", () => {
  const directory: ContactDirectory = new Map();
  addContacts(directory, [
    {
      id: "987654321@lid",
      lid: "987654321@lid",
      phoneNumber: "5521988888888@s.whatsapp.net",
      name: "Cliente Teste",
    } satisfies Contact,
  ]);

  assert.deepEqual(resolvePeer("987654321@lid", directory), {
    remoteJid: "987654321@lid",
    phone: "+5521988888888",
    displayName: "Cliente Teste",
  });
});

test("does not mistake an unresolved LID for a phone number", () => {
  assert.equal(resolvePeer("987654321@lid", new Map()), null);
});

test("extracts text and media placeholders without downloading media", () => {
  assert.deepEqual(extractMessage({ message: { conversation: "  Olá  " }, key: {} } as never), {
    type: "text",
    content: "Olá",
  });
  assert.deepEqual(extractMessage({ message: { audioMessage: {} }, key: {} } as never), {
    type: "audio",
    content: "🎵 Áudio",
  });
});

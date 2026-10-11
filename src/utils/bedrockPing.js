import dgram from "dgram";
import { randomBytes } from "crypto";

const UNCONNECTED_PING = 0x01;
const UNCONNECTED_PONG = 0x1c;
// A constante que todo pacote offline do RakNet carrega (é como o servidor reconhece um ping de Bedrock).
const RAKNET_MAGIC = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
// byte do id + 8 do tempo + 8 do id do servidor + 16 do magic = onde começa o tamanho do texto.
const PONG_TEXT_OFFSET = 1 + 8 + 8 + RAKNET_MAGIC.length;

/**
 * Pergunta direto ao servidor Bedrock (o mesmo ping que o cliente do Minecraft faz na lista de servidores) se ele
 * está no ar e quantos jogadores tem. Funciona com qualquer servidor, sem plugin e sem Redis — é o plano B do
 * services/serverStatus.js para quando o HyzenCore não está mandando o batimento.
 * Devolve { players, maxPlayers, motd, version } ou null se ninguém respondeu no tempo (servidor offline, porta UDP
 * fechada, endereço errado).
 */
export function pingBedrock(host, port = 19132, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on("error", () => finish(null));
    socket.on("message", (message) => finish(parsePong(message)));

    const ping = Buffer.alloc(1 + 8 + RAKNET_MAGIC.length + 8);
    ping.writeUInt8(UNCONNECTED_PING, 0);
    ping.writeBigInt64BE(BigInt(Date.now()), 1);
    RAKNET_MAGIC.copy(ping, 9);
    randomBytes(8).copy(ping, 9 + RAKNET_MAGIC.length);

    // O send resolve o nome (DNS) sozinho; um host que não existe cai no callback com erro.
    socket.send(ping, port, host, (err) => {
      if (err) finish(null);
    });
  });
}

// O texto do pong: "MCPE;motd;protocolo;versão;jogadores;máximo;id;sub-motd;modo;..."
export function parsePong(message) {
  if (message.length < PONG_TEXT_OFFSET + 2 || message.readUInt8(0) !== UNCONNECTED_PONG) return null;

  const length = message.readUInt16BE(PONG_TEXT_OFFSET);
  const fields = message.toString("utf8", PONG_TEXT_OFFSET + 2, PONG_TEXT_OFFSET + 2 + length).split(";");
  const players = Number(fields[4]);
  const maxPlayers = Number(fields[5]);
  if (fields.length < 6 || !Number.isFinite(players)) return null;

  return {
    players,
    maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : null,
    motd: fields[1] || null,
    version: fields[3] || null,
  };
}

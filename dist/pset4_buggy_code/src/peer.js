"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Peer = void 0;
const logger_1 = require("./logger");
const semver_1 = __importDefault(require("semver"));
const message_1 = require("./message");
const peermanager_1 = require("./peermanager");
const chaintipmanager_1 = require("./chaintipmanager");
const json_canonicalize_1 = require("json-canonicalize");
const object_1 = require("./object");
const network_1 = require("./network");
const VERSION = "0.9.0";
const NAME = "Malibu (pset3)";
// Number of peers that each peer is allowed to report to us
const MAX_PEERS_PER_PEER = 30;
class Peer {
    sendHello() {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "hello",
                version: VERSION,
                agent: NAME,
            });
        });
    }
    sendGetPeers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "getpeers",
            });
        });
    }
    sendPeers() {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "peers",
                peers: [...peermanager_1.peerManager.knownPeers],
            });
        });
    }
    sendGetChaintip() {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({ type: "getchaintip" });
        });
    }
    sendChaintip() {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({ type: "chaintip", blockid: chaintipmanager_1.chaintipManager.blockid });
        });
    }
    sendIHaveObject(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "ihaveobject",
                objectid: object_1.objectManager.id(obj),
            });
        });
    }
    sendObject(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "object",
                object: obj,
            });
        });
    }
    sendGetObject(objid) {
        return __awaiter(this, void 0, void 0, function* () {
            this.sendMessage({
                type: "getobject",
                objectid: objid,
            });
        });
    }
    sendError(err) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.sendMessage(err.getJSON());
            }
            catch (error) {
                this.sendMessage(new message_1.AnnotatedError("INTERNAL_ERROR", `Failed to serialize error message: ${error}`).getJSON());
            }
        });
    }
    sendMessage(obj) {
        const message = (0, json_canonicalize_1.canonicalize)(obj);
        this.debug(`Sending message: ${message}`);
        this.socket.sendMessage(message);
    }
    /**
     * fatalError is called when a peer sends us a message that we cannot
     * parse, or when we encounter an internal error. We send the error
     * message to the peer, and then close the connection.
     *
     * @param err the error to send to the peer
     */
    fatalError(err) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.sendError(err);
            this.warn(`Peer error: ${err}`);
            this.fail();
        });
    }
    fail() {
        return __awaiter(this, void 0, void 0, function* () {
            this.active = false;
            this.socket.end();
            peermanager_1.peerManager.peerFailed(this.peerAddr);
        });
    }
    /**
     * Called when a peer connects to us
     */
    onConnect() {
        return __awaiter(this, void 0, void 0, function* () {
            this.active = true;
            yield this.sendHello();
            yield this.sendGetPeers();
            yield this.sendGetChaintip();
        });
    }
    /**
     * Called when a peer does not send us an complete message within
     * a certain amount of time. We close the connection.
     *
     * @returns a promise that resolves when the connection is closed
     */
    onTimeout() {
        return __awaiter(this, void 0, void 0, function* () {
            // QUESTION: Why we need to return a promise here?
            return yield this.fatalError(new message_1.AnnotatedError("INVALID_FORMAT", "Timed out before message was complete"));
        });
    }
    onMessage(message) {
        return __awaiter(this, void 0, void 0, function* () {
            this.debug(`Message arrival: ${message}`);
            let msg;
            try {
                msg = JSON.parse(message);
                this.debug(`Parsed message into: ${JSON.stringify(msg)}`);
            }
            catch (_a) {
                return yield this.fatalError(new message_1.AnnotatedError("INVALID_FORMAT", `Failed to parse incoming message as JSON: ${message}`));
            }
            if (!message_1.Message.guard(msg)) {
                const validation = message_1.Message.validate(msg);
                return yield this.fatalError(new message_1.AnnotatedError("INVALID_FORMAT", `The received message does not match one of the known message formats: ${message}
         Validation error: ${JSON.stringify(validation)}`));
            }
            if (!this.handshakeCompleted) {
                if (message_1.HelloMessage.guard(msg)) {
                    return this.onMessageHello(msg);
                }
                return yield this.fatalError(new message_1.AnnotatedError("INVALID_HANDSHAKE", `Received message ${message} prior to "hello"`));
            }
            message_1.Message.match(() => __awaiter(this, void 0, void 0, function* () {
                return yield this.fatalError(new message_1.AnnotatedError("INVALID_HANDSHAKE", `Received a second "hello" message, even though handshake is completed`));
            }), this.onMessageGetPeers.bind(this), this.onMessagePeers.bind(this), this.onMessageIHaveObject.bind(this), this.onMessageGetObject.bind(this), this.onMessageObject.bind(this), this.onMessageError.bind(this), this.OnMessageChaintip.bind(this), this.OnMessageGetChaintip.bind(this))(msg);
        });
    }
    onMessageHello(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!semver_1.default.satisfies(msg.version, `^${VERSION}`)) {
                return yield this.fatalError(new message_1.AnnotatedError("INVALID_FORMAT", `You sent an incorrect version (${msg.version}), which is not compatible with this node's version ${VERSION}.`));
            }
            this.info(`Handshake completed. Remote peer running ${msg.agent} at protocol version ${msg.version}`);
            this.handshakeCompleted = true;
        });
    }
    onMessagePeers(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const peer of msg.peers.slice(0, MAX_PEERS_PER_PEER)) {
                this.info(`Remote party reports knowledge of peer ${peer}`);
                peermanager_1.peerManager.peerDiscovered(peer);
            }
            if (msg.peers.length > MAX_PEERS_PER_PEER) {
                this.info(`Remote party reported ${msg.peers.length} peers, but we processed only ${MAX_PEERS_PER_PEER} of them.`);
            }
        });
    }
    OnMessageChaintip(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.info(`Peer claims chaintip: ${msg.blockid}`);
            if (!(yield object_1.db.exists(msg.blockid))) {
                this.info(`Object ${msg.blockid} discovered`);
                yield this.sendGetObject(msg.blockid);
            }
        });
    }
    onMessageGetPeers(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.info(`Remote party is requesting peers. Sharing.`);
            yield this.sendPeers();
        });
    }
    OnMessageGetChaintip(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.info(`Remote party is requesting chaintip. Sharing`);
            yield this.sendChaintip();
        });
    }
    onMessageIHaveObject(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.info(`Peer claims knowledge of: ${msg.objectid}`);
            if (!(yield object_1.db.exists(msg.objectid))) {
                this.info(`Object ${msg.objectid} discovered`);
                yield this.sendGetObject(msg.objectid);
            }
        });
    }
    onMessageGetObject(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.info(`Peer requested object with id: ${msg.objectid}`);
            let obj;
            try {
                obj = yield object_1.objectManager.get(msg.objectid);
            }
            catch (e) {
                this.warn(`We don't have the requested object with id: ${msg.objectid}`);
                this.sendError(new message_1.AnnotatedError("UNKNOWN_OBJECT", `Unknown object with id ${msg.objectid}`));
                return;
            }
            yield this.sendObject(obj);
        });
    }
    /**
     * Called when a peer sends us an object. We store it in the database,
     * and then validate it. If it is valid, we gossip it to our peers.
     *
     * @param msg message containing the object
     */
    onMessageObject(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            const objectid = object_1.objectManager.id(msg.object);
            let known = false;
            this.info(`Received object with id ${objectid}: %o`, msg.object);
            known = yield object_1.objectManager.exists(objectid);
            if (known) {
                this.debug(`Object with id ${objectid} is already known`);
            }
            else {
                this.info(`New object with id ${objectid} downloaded: %o`, msg.object);
                // store object even if it is invalid
                yield object_1.objectManager.put(msg.object);
            }
            // validate object
            // if it is invalid, we will send an error message to the peer
            let instance;
            try {
                instance = yield object_1.objectManager.validate(msg.object, this);
            }
            catch (e) {
                this.sendError(e);
                return;
            }
            if (!known) {
                // gossip
                network_1.network.broadcast({
                    type: "ihaveobject",
                    objectid,
                });
            }
        });
    }
    /**
     * Called when the peer reports an error
     *
     * @param msg the error message
     */
    onMessageError(msg) {
        return __awaiter(this, void 0, void 0, function* () {
            this.warn(`Peer reported error: ${msg.name}`);
        });
    }
    /**
     * the function to log messages with the peer's address
     *
     * @param level the log level
     * @param message message to log
     * @param args additional arguments to log
     */
    log(level, message, ...args) {
        logger_1.logger.log(level, `[peer ${this.socket.peerAddr}:${this.socket.netSocket.remotePort}] ${message}`, ...args);
    }
    warn(message, ...args) {
        this.log("warn", message, ...args);
    }
    info(message, ...args) {
        this.log("info", message, ...args);
    }
    debug(message, ...args) {
        this.log("debug", message, ...args);
    }
    constructor(socket, peerAddr) {
        this.active = false;
        this.handshakeCompleted = false;
        this.socket = socket;
        this.peerAddr = peerAddr;
        socket.netSocket.on("connect", this.onConnect.bind(this));
        socket.netSocket.on("error", (err) => {
            this.warn(`Socket error: ${err}`);
            this.fail();
        });
        socket.on("message", this.onMessage.bind(this));
        socket.on("timeout", this.onTimeout.bind(this));
    }
}
exports.Peer = Peer;

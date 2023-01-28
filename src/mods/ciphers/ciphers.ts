import { Cipher } from "mods/ciphers/cipher.js"
import { AES_256_CBC } from "mods/ciphers/encryptions/aes_256_cbc/aes_256_cbc.js"
import { SHA } from "mods/ciphers/hashes/sha/sha.js"
import { DHE_RSA } from "mods/ciphers/key_exchanges/dhe_rsa/dhe_rsa.js"
import { AES_128_CBC } from "./encryptions/aes_128_cbc/aes_128_cbc.js"
import { AES_128_GCM } from "./encryptions/aes_128_gcm/aes_128_gcm.js"
import { AES_256_GCM } from "./encryptions/aes_256_gcm/aes_256_gcm.js"
import { SHA256 } from "./hashes/sha256/sha256.js"
import { SHA384 } from "./hashes/sha384/sha384.js"

/**
 * Weak ciphers
 */
export const TLS_DHE_RSA_WITH_AES_128_CBC_SHA = new Cipher(0x0033, DHE_RSA, AES_128_CBC, SHA)
export const TLS_DHE_RSA_WITH_AES_256_CBC_SHA = new Cipher(0x0039, DHE_RSA, AES_256_CBC, SHA)

export const TLS_DHE_RSA_WITH_AES_128_CBC_SHA256 = new Cipher(0x0067, DHE_RSA, AES_128_CBC, SHA256)
export const TLS_DHE_RSA_WITH_AES_256_CBC_SHA256 = new Cipher(0x006B, DHE_RSA, AES_256_CBC, SHA256)

/**
 * Modern ciphers
 */
export const TLS_DHE_RSA_WITH_AES_128_GCM_SHA256 = new Cipher(0x009E, DHE_RSA, AES_128_GCM, SHA256)
export const TLS_DHE_RSA_WITH_AES_256_GCM_SHA384 = new Cipher(0x009F, DHE_RSA, AES_256_GCM, SHA384)
import { JSONArray, JSONObject } from 'k6'
import http, { RefinedResponse, ResponseType } from 'k6/http'

import { AWSClient, AWSRequest } from './client'
import { AWSError } from './error'
import { AWSConfig } from './config'
import { InvalidSignatureError, URIEncodingConfig } from './signature'
import { v4 as uuidv4 } from 'uuid'
import { HTTPMethod, HTTPHeaders } from './http'

/**
 * Class allowing to interact with Amazon AWS's KMS service
 */
export class KMSClient extends AWSClient {
    method: HTTPMethod
    commonHeaders: HTTPHeaders

    /**
     * Create a KMSClient
     * @param  {AWSConfig} awsConfig - configuration attributes to use when interacting with AWS' APIs
     */
    constructor(awsConfig: AWSConfig) {
        const URIencodingConfig = new URIEncodingConfig(true, false)
        super(awsConfig, 'kms', URIencodingConfig)

        // this.serviceName = 'kms'

        // All interactions with the KMS service
        // are made via the GET or POST method.
        this.method = 'POST'

        this.commonHeaders = {
            'Accept-Encoding': 'identity',
            'Content-Type': 'application/x-amz-json-1.1',
        }
    }
    /**
     * GenerateDataKey
     * Used to generate data key with the KMS key defined
     * @param {string} KeyId
     * @param {number} NumberOfBytes
     * @throws {KMSServiceError}
     * @throws {InvalidSignatureError}
     */
    GenerateDataKey(KeyId: string, NumberOfBytes: number = 32): DataKeyResp | undefined {
        const body = JSON.stringify({ KeyId: KeyId, NumberOfBytes : NumberOfBytes })
        const signedRequest: AWSRequest = super.buildRequest(
            this.method,
            this.host,
            '/',
            '',
            body,
            {
                ...this.commonHeaders,
                'X-Amz-Target': `TrentService.GenerateDataKey`,
            }
        )
        const res = http.request(this.method, signedRequest.url, body, {
            headers: signedRequest.headers,
        })
        this._handle_error('GenerateDataKey', res)

        return DataKeyResp.fromJSON(res.json() as JSONObject)
    }
    
    get host() {
        return `${this.serviceName}.${this.awsConfig.region}.amazonaws.com`
    }
    
    // TODO: operation should be an enum
    _handle_error(operation: string, response: RefinedResponse<ResponseType | undefined>) {
        const errorCode = response.error_code
        if (errorCode === 0) {
            return
        }

        const error = response.json() as JSONObject
        if (errorCode >= 1400 && errorCode <= 1499) {
            // In the event of certain errors, the message is not set.
            // Also, note the inconsistency in casing...
            const errorMessage: string =
                (error.Message as string) || (error.message as string) || (error.__type as string)

            // Handle specifically the case of an invalid signature
            if (error.__type === 'InvalidSignatureException') {
                throw new InvalidSignatureError(errorMessage, error.__type)
            }

            // Otherwise throw a standard service error
            throw new KMSServiceError(errorMessage, error.__type as string, operation)
        }

        if (errorCode === 1500) {
            throw new KMSServiceError(
                'An error occured on the server side',
                'InternalServiceError',
                operation
            )
        }
    }
}


/**
 * Class representing a data key
 */
export class DataKey {
    /**
     * The Amazon Resource Name (key ARN) of the KMS key that encrypted the data key.
     */
    id: string

    /**
     * The (base64-encoded) encrypted copy of the data key.
     */
    ciphertextBlob: string

    /**
     * The plaintext data key.
     * Use this data key to encrypt your data outside of KMS. Then, remove it from memory as soon as possible.
     */
    plaintext: string

    constructor(CiphertextBlob: string, KeyId: string, Plaintext: string) {
        this.ciphertextBlob = CiphertextBlob
        this.id = KeyId
        this.plaintext = Plaintext
    }

    static fromJSON(json: JSONObject) {
        return new DataKey(
            json.CiphertextBlob as string,
            json.KeyId as string,
            json.Plaintext as string
        )
    }
}

export class KMSServiceError extends AWSError {
    operation: string

    /**
     * Constructs a SecretsManagerServiceError
     *
     * @param  {string} message - human readable error message
     * @param  {string} code - A unique short code representing the error that was emitted
     * @param  {string} operation - Name of the failed Operation
     */
    constructor(message: string, code: string, operation: string) {
        super(message, code)
        this.name = 'KMSServiceError'
        this.operation = operation
    }
}

/**
 *  KMSKeyLength describes possible key lenght values for KMS API data key operations.
 */
enum KMSKeyLength {
    KeySize256 = 32,
    KeySize512 = 64,
}

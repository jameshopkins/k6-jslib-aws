import exec from 'k6/execution'

import { AWSConfig, KinesisClient } from '../build/kinesis.js'
import encoding from 'k6/encoding'
import { describe, expect } from 'https://jslib.k6.io/k6chaijs/4.3.4.2/index.js'
import { fail } from 'k6'

const dummyStream = `kinesis-test-stream-provisioned`

const awsConfig = new AWSConfig({
    region: __ENV.AWS_REGION,
    accessKeyId: __ENV.AWS_ACCESS_KEY_ID,
    secretAccessKey: __ENV.AWS_SECRET_ACCESS_KEY,
    sessionToken: __ENV.AWS_SESSION_TOKEN,
})

const kinesis = new KinesisClient(awsConfig)

const getShardIds = () => {
    const res = kinesis.listShards(dummyStream)
    const shardIds = res.Shards.map((shard) => shard.ShardId)

    return shardIds
}

const getShardIterator = (shardId) => {
    const res = kinesis.getShardIterator(dummyStream, shardId, `TRIM_HORIZON`)
    return res.ShardIterator
}

export default function () {
    describe('01. Create kinesis Stream', () => {
        try {
            // Valid Values: PROVISIONED | ON_DEMAND
            kinesis.createStream(dummyStream, {
                ShardCount: 10,
                StreamModeDetails: {
                    StreamMode: 'PROVISIONED',
                },
            })
        } catch (err) {
            fail(err)
        }
    })

    describe('02. List Kinesis streams', () => {
        try {
            const res = kinesis.listStreams()
            expect(res.StreamNames.length, 'number of streams').to.equal(1)
        } catch (err) {
            fail(err)
        }
    })

    describe('03. List kinesis stream with arguments', () => {
        try {
            const res = kinesis.listStreams({ limit: 1 })
            expect(res.StreamNames.length, 'number of streams').to.equal(1)
        } catch (err) {
            fail(err)
        }
        sleep(2)
    })

    describe('04. publish to kinesis Stream', () => {
        try {
            for (let i = 0; i < 50; i++) {
                const res = kinesis.putRecords({
                    StreamName: dummyStream,
                    Records: [
                        {
                            Data: encoding.b64encode(JSON.stringify({ this: 'is', a: 'test' })),
                            PartitionKey: 'partitionKey1',
                        },
                        {
                            Data: encoding.b64encode(
                                JSON.stringify([{ this: 'is', second: 'test' }])
                            ),
                            PartitionKey: 'partitionKey2',
                        },
                    ],
                })
                expect(res.FailedRecordCount, `Failed Records to publish`).to.equal(0)
                expect(res.Records.length, `Total Records`).to.equal(2)
            }
        } catch (err) {
            fail(err)
        }
    })

    describe('05. Gets an Amazon Kinesis read all data ', () => {
        try {
            const shards = getShardIds()
            shards.map((shard) => {
                let iterator = getShardIterator(shard)
                while (true) {
                    const res = kinesis.getRecords({ ShardIterator: iterator })
                    iterator = res.NextShardIterator

                    if (!res.MillisBehindLatest || res.MillisBehindLatest == `0`) {
                        break
                    }
                }
            })
        } catch (err) {
            fail(err)
        }
    })

    describe('06. Delete kinesis Stream', () => {
        try {
            kinesis.deleteStream({ StreamName: dummyStream })
        } catch (err) {
            fail(err)
        }
    })
}
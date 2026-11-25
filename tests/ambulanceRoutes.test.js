const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { once } = require("node:events");

const AmbulanceRequest = require("../models/AmbulanceRequest");
const User = require("../models/User");
const router = require("../routes/ambulanceRoutes");

const JWT_SECRET = "ambulance-routes-test-secret";
const DRIVER_ID = "111111111111111111111111";
const PATIENT_ID = "222222222222222222222222";
const REQUEST_ID = "333333333333333333333333";
const NEXT_REQUEST_ID = "444444444444444444444444";

function matches(document, filter) {
    return Object.entries(filter).every(([key, expected]) => {
        const actual = document[key];

        if (expected && typeof expected === "object") {
            if (expected.$in) {
                return expected.$in.includes(actual);
            }
            if (Object.hasOwn(expected, "$ne")) {
                return String(actual) !== String(expected.$ne);
            }
        }

        if (expected === null) {
            return actual === null || actual === undefined;
        }

        return String(actual) === String(expected);
    });
}

function queryPromise(value) {
    const promise = Promise.resolve(value);
    promise.session = () => promise;
    promise.populate = () => promise;
    promise.select = () => promise;
    return promise;
}

function makeRequest(id, status, assignedDriver = null) {
    return {
        _id: id,
        patient: PATIENT_ID,
        assignedDriver,
        pickupLocation: "Pickup",
        pickupCoordinates: { type: "Point", coordinates: [0, 0] },
        destination: "Hospital",
        emergencyType: "Medical Emergency",
        description: "",
        status,
        createdAt: new Date()
    };
}

async function setup(t, { requests = [], drivers = [] } = {}) {
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;

    const originalMethods = {
        startSession: mongoose.startSession,
        requestFind: AmbulanceRequest.find,
        requestFindOne: AmbulanceRequest.findOne,
        requestFindOneAndUpdate: AmbulanceRequest.findOneAndUpdate,
        requestCreate: AmbulanceRequest.create,
        userFindOneAndUpdate: User.findOneAndUpdate,
        userUpdateOne: User.updateOne
    };

    const state = {
        requests: requests.map((request) => ({ ...request })),
        drivers: drivers.map((driver) => ({ ...driver })),
        nextId: 1
    };

    mongoose.startSession = async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    });

    AmbulanceRequest.find = (filter) => {
        const result = queryPromise(
            state.requests.filter((request) => matches(request, filter))
        );
        result.populate = () => result;
        result.sort = () => result;
        return result;
    };
    AmbulanceRequest.findOne = (filter) =>
        queryPromise(state.requests.find((request) => matches(request, filter)) || null);
    AmbulanceRequest.findOneAndUpdate = (filter, update) => {
        const request = state.requests.find((item) => matches(item, filter));
        if (request) {
            Object.assign(request, update.$set);
        }
        return queryPromise(request || null);
    };
    AmbulanceRequest.create = async (data) => {
        const request = makeRequest(
            (state.nextId++).toString(16).padStart(24, "0"),
            "pending"
        );
        Object.assign(request, data);
        state.requests.push(request);
        return request;
    };
    User.findOneAndUpdate = (filter, update) => {
        const driver = state.drivers.find((item) => matches(item, filter));
        if (driver) {
            Object.assign(driver, update.$set || update);
        }
        return queryPromise(driver || null);
    };
    User.updateOne = async (filter, update) => {
        const driver = state.drivers.find((item) => matches(item, filter));
        if (driver) {
            Object.assign(driver, update.$set || update);
        }
        return { matchedCount: driver ? 1 : 0 };
    };

    const app = express();
    app.use(express.json());
    app.use("/api/ambulance", router);

    const server = app.listen(0);
    await once(server, "listening");

    t.after(async () => {
        await new Promise((resolve, reject) =>
            server.close((error) => error ? reject(error) : resolve())
        );

        mongoose.startSession = originalMethods.startSession;
        AmbulanceRequest.find = originalMethods.requestFind;
        AmbulanceRequest.findOne = originalMethods.requestFindOne;
        AmbulanceRequest.findOneAndUpdate = originalMethods.requestFindOneAndUpdate;
        AmbulanceRequest.create = originalMethods.requestCreate;
        User.findOneAndUpdate = originalMethods.userFindOneAndUpdate;
        User.updateOne = originalMethods.userUpdateOne;

        if (originalJwtSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = originalJwtSecret;
        }
    });

    async function call(method, path, { userId = DRIVER_ID, role = "driver", body } = {}) {
        const token = jwt.sign({ userId, role }, JWT_SECRET);
        const response = await fetch(
            `http://127.0.0.1:${server.address().port}/api/ambulance${path}`,
            {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: body === undefined ? undefined : JSON.stringify(body)
            }
        );
        return {
            status: response.status,
            body: await response.json()
        };
    }

    return { call, state };
}

test("driver with no active assignment can accept a pending request", async (t) => {
    const { call, state } = await setup(t, {
        requests: [
            makeRequest(REQUEST_ID, "pending"),
            makeRequest(NEXT_REQUEST_ID, "pending")
        ],
        drivers: [{ _id: DRIVER_ID, role: "driver", isAvailable: true }]
    });

    const response = await call("PATCH", `/${REQUEST_ID}/accept`);

    assert.equal(response.status, 200);
    assert.equal(response.body.request.status, "accepted");
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[0].assignedDriver, DRIVER_ID);
    assert.equal(state.requests[1].status, "pending");

    const assigned = await call("GET", "/my-assigned");
    const available = await call("GET", "/available");
    assert.equal(assigned.body.activeTripCount, 1);
    assert.equal(available.body.requests.length, 1);
    assert.equal(available.body.requests[0]._id, NEXT_REQUEST_ID);

    const patientRequests = await call("GET", "/my-requests", {
        userId: PATIENT_ID,
        role: "patient"
    });
    assert.equal(patientRequests.body.requests[0].status, "accepted");
    assert.equal(patientRequests.body.requests[0].assignedDriver, DRIVER_ID);
});

test("driver with an active assignment cannot accept another request", async (t) => {
    const { call, state } = await setup(t, {
        requests: [
            makeRequest(REQUEST_ID, "accepted", DRIVER_ID),
            makeRequest(NEXT_REQUEST_ID, "pending")
        ],
        drivers: [{ _id: DRIVER_ID, role: "driver", isAvailable: true }]
    });

    const response = await call("PATCH", `/${NEXT_REQUEST_ID}/accept`);

    assert.equal(response.status, 409);
    assert.match(response.body.message, /active ambulance request/i);
    assert.equal(state.requests[1].status, "pending");
});

for (const terminalStatus of ["completed", "cancelled"]) {
    test(`${terminalStatus} assignments do not block a new acceptance`, async (t) => {
        const { call } = await setup(t, {
            requests: [
                makeRequest(REQUEST_ID, terminalStatus, DRIVER_ID),
                makeRequest(NEXT_REQUEST_ID, "pending")
            ],
            drivers: [{ _id: DRIVER_ID, role: "driver", isAvailable: true }]
        });

        const response = await call("PATCH", `/${NEXT_REQUEST_ID}/accept`);

        assert.equal(response.status, 200);
        assert.equal(response.body.request._id, NEXT_REQUEST_ID);
    });
}

test("only one driver can accept a pending request", async (t) => {
    const secondDriverId = "555555555555555555555555";
    const { call, state } = await setup(t, {
        requests: [makeRequest(REQUEST_ID, "pending")],
        drivers: [
            { _id: DRIVER_ID, role: "driver", isAvailable: true },
            { _id: secondDriverId, role: "driver", isAvailable: true }
        ]
    });

    const results = await Promise.all([
        call("PATCH", `/${REQUEST_ID}/accept`, { userId: DRIVER_ID }),
        call("PATCH", `/${REQUEST_ID}/accept`, { userId: secondDriverId })
    ]);

    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(state.requests.filter((request) => request.status === "accepted").length, 1);
});

test("assigned request list reports accurate active trips and history", async (t) => {
    const { call } = await setup(t, {
        requests: [
            makeRequest(REQUEST_ID, "accepted", DRIVER_ID),
            makeRequest(NEXT_REQUEST_ID, "assigned", DRIVER_ID),
            makeRequest("666666666666666666666666", "completed", DRIVER_ID),
            makeRequest("777777777777777777777777", "cancelled", DRIVER_ID)
        ]
    });

    const response = await call("GET", "/my-assigned");

    assert.equal(response.status, 200);
    assert.equal(response.body.requests.length, 4);
    assert.equal(response.body.activeRequests.length, 2);
    assert.equal(response.body.activeTripCount, 2);
});

test("assigned trips can be completed and no longer count as active", async (t) => {
    const { call, state } = await setup(t, {
        requests: [makeRequest(REQUEST_ID, "assigned", DRIVER_ID)],
        drivers: [{ _id: DRIVER_ID, role: "driver", isAvailable: false }]
    });

    const response = await call("PATCH", `/${REQUEST_ID}/complete`);

    assert.equal(response.status, 200);
    assert.equal(response.body.request.status, "completed");
    assert.equal(state.drivers[0].isAvailable, true);
});

test("patients can repeatedly create requests within the short-window allowance", async (t) => {
    const { call, state } = await setup(t);
    const body = {
        pickupLocation: "Pickup",
        destination: "Hospital",
        emergencyType: "Medical Emergency",
        longitude: 0,
        latitude: 0
    };

    const responses = [];
    for (let index = 0; index < 30; index += 1) {
        responses.push(await call("POST", "/request", {
            userId: PATIENT_ID,
            role: "patient",
            body
        }));
    }

    const limitedResponse = await call("POST", "/request", {
        userId: PATIENT_ID,
        role: "patient",
        body
    });

    assert.ok(responses.every((response) => response.status === 201));
    assert.equal(limitedResponse.status, 429);
    assert.match(limitedResponse.body.message, /one minute/i);
    assert.equal(state.requests.length, 30);
});

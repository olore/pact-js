const path = require("path")
const chai = require("chai")
const chaiAsPromised = require("chai-as-promised")
const expect = chai.expect
const { PactV3, Matchers } = require("@pact-foundation/pact/dist/v3")
const LOG_LEVEL = process.env.LOG_LEVEL || "WARN"

chai.use(chaiAsPromised)

describe("Pact V3", () => {
  // Alias flexible matchers for simplicity
  const {
    eachLike,
    atLeastLike,
    integer,
    timestamp,
    boolean,
    string,
    regex,
    like,
  } = Matchers

  // Animal we want to match :)
  const suitor = {
    id: 2,
    available_from: "2017-12-04T14:47:18.582Z",
    first_name: "Nanny",
    animal: "goat",
    last_name: "Doe",
    age: 27,
    gender: "F",
    location: {
      description: "Werribee Zoo",
      country: "Australia",
      post_code: 3000,
    },
    eligibility: {
      available: true,
      previously_married: true,
    },
    interests: ["walks in the garden/meadow", "parkour"],
  }

  const MIN_ANIMALS = 2

  // Define animal payload, with flexible matchers
  //
  // This makes the test much more resilient to changes in actual data.
  // Here we specify the 'shape' of the object that we care about.
  // It is also import here to not put in expectations for parts of the
  // API we don't care about
  const animalBodyExpectation = {
    id: integer(1),
    available_from: timestamp("yyyy-MM-dd'T'HH:mm:ss.SZ"),
    first_name: string("Billy"),
    last_name: string("Goat"),
    animal: string("goat"),
    age: integer(21),
    gender: regex("F|M", "M"),
    location: {
      description: string("Melbourne Zoo"),
      country: string("Australia"),
      post_code: integer(3000),
    },
    eligibility: {
      available: boolean(true),
      previously_married: boolean(false),
    },
    interests: eachLike("walks in the garden/meadow"),
  }

  // Define animal list payload, reusing existing object matcher
  const animalListExpectation = atLeastLike(animalBodyExpectation, MIN_ANIMALS)

  // Configure and import consumer API
  // Note that we update the API endpoint to point at the Mock Service
  const {
    createMateForDates,
    suggestion,
    getAnimalById,
  } = require("../consumer")

  // Verify service client works as expected.
  //
  // Note that we don't call the consumer API endpoints directly, but
  // use unit-style tests that test the collaborating function behaviour -
  // we want to test the function that is calling the external service.
  describe("when a call to list all animals from the Animal Service is made", () => {
    describe("and the user is not authenticated", () => {
      const provider = new PactV3({
        consumer: "Matching Service",
        provider: "Animal Profile Service",
        dir: path.resolve(process.cwd(), "pacts"),
        logLevel: LOG_LEVEL,
      })

      before(() =>
        provider
          .given("is not authenticated")
          .uponReceiving("a request for all animals")
          .withRequest({
            path: "/animals/available",
          })
          .willRespondWith({
            status: 401,
          })
      )

      it("returns a 401 unauthorized", () => {
        return provider.executeTest(mockserver => {
          return expect(
            suggestion(suitor, () => mockserver.url)
          ).to.eventually.be.rejectedWith("Unauthorized")
        })
      })
    })
    describe("and the user is authenticated", () => {
      describe("and there are animals in the database", () => {
        const provider = new PactV3({
          consumer: "Matching Service",
          provider: "Animal Profile Service",
          dir: path.resolve(process.cwd(), "pacts")
        })

        before(() => {
          provider
            .given("Has some animals")
            .uponReceiving("a request for all animals")
            .withRequest({
              path: "/animals/available",
              headers: { Authorization: "Bearer token" },
            })
            .willRespondWith({
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
              },
              body: animalListExpectation,
            })
        })

        it("returns a list of animals", () => {
          return provider.executeTest(mockserver => {
            const suggestedMates = suggestion(suitor, () => mockserver.url)
            return Promise.all([
              expect(suggestedMates).to.eventually.have.deep.property(
                "suggestions[0].score",
                94
              ),
              expect(suggestedMates)
                .to.eventually.have.property("suggestions")
                .with.lengthOf(MIN_ANIMALS),
            ])
          })
        })
      })
    })
  })

  describe("when a call to the Animal Service is made to retrieve a single animal by ID", () => {
    describe("and there is an animal in the DB with ID 1", () => {
      const provider = new PactV3({
        consumer: "Matching Service",
        provider: "Animal Profile Service",
        dir: path.resolve(process.cwd(), "pacts")
      })

      before(() =>
        provider
          .given("Has an animal with ID 1")
          .uponReceiving("a request for an animal with ID 1")
          .withRequest({
            path: regex("/animals/[0-9]+", "/animals/1"),
            headers: { Authorization: "Bearer token" },
          })
          .willRespondWith({
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
            body: animalListExpectation,
          })
      )

      it("returns the animal", () => {
        return provider.executeTest(mockserver => {
          const suggestedMates = getAnimalById(11, () => mockserver.url)

          return expect(suggestedMates).to.eventually.have.deep.property(
            "id",
            1
          )
        })
      })
    })

    describe("and there no animals in the database", () => {
      const provider = new PactV3({
        consumer: "Matching Service",
        provider: "Animal Profile Service",
        dir: path.resolve(process.cwd(), "pacts"),
        logLevel: LOG_LEVEL,
      })

      before(() =>
        provider
          .given("Has no animals")
          .uponReceiving("a request for an animal with ID 100")
          .withRequest({
            method: "GET",
            path: "/animals/100",
            headers: { Authorization: "Bearer token" },
          })
          .willRespondWith({
            status: 404,
          })
      )

      it("returns a 404", () => {
        return provider.executeTest(mockserver => {
          // uncomment below to test a failed verify
          // const suggestedMates = getAnimalById(123, () => mockserver.url)
          const suggestedMates = getAnimalById(100, () => mockserver.url)

          return expect(suggestedMates).to.eventually.be.a("null")
        })
      })
    })
  })

  describe("when a call to the Animal Service is made to create a new mate", () => {
    const provider = new PactV3({
      consumer: "Matching Service",
      provider: "Animal Profile Service",
      dir: path.resolve(process.cwd(), "pacts"),
      logLevel: LOG_LEVEL,
    })

    before(() =>
      provider
        .uponReceiving("a request to create a new mate")
        .withRequest({
          method: "POST",
          path: "/animals",
          body: like(suitor),
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        })
        .willRespondWith({
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
          body: like(suitor),
        })
    )

    it("creates a new mate", () => {
      return provider.executeTest(mockserver => {
        return expect(createMateForDates(suitor, () => mockserver.url)).to
          .eventually.be.fulfilled
      })
    })
  })
})

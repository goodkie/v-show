# Server-Side Limit Enforcement Engine

Limits enforced strictly on backend mutate operations:

- createProduct (Server API): Rejects product > 30 on PRO, > 100 on BUSINESS.
- ddOrUpdateDiyProduct: Checks plan limits with friendly upgrade guidance.
- duplicateDiyProduct: Validates product limits prior to duplication.
- ulkAddDiyProducts: Validates batch additions against available quota.

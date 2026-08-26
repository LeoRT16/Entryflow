export class AccreditationCheckInAlreadyConsumedError extends Error {
  constructor(message = "El acceso ya fue consumido.") {
    super(message);
    this.name = "AccreditationCheckInAlreadyConsumedError";
  }
}

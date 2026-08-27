export class AccreditationProgramValidationError extends Error {
  code: string;
  field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "AccreditationProgramValidationError";
    this.code = code;
    this.field = field;
  }
}

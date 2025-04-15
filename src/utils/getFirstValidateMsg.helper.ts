import { ValidationError } from 'class-validator';

export function getFirstValidateMsg(
  validationError: ValidationError[],
  parent = '',
): string {
  const error = validationError[0];
  console.log(error);

  if (error.constraints) {
    return `${parent ? parent + '.' : ''}${
      Object.values(error.constraints)[0]
    }`;
  }

  const nestedError = error.children[0];
  const nestedParent = `${parent ? parent + '.' : ''}${error.property}`;
  return getFirstValidateMsg([nestedError], nestedParent);
}

import { ValidationError } from 'class-validator';

export function getFirstValidateMsg(
  validationErrors: ValidationError[],
  parentPath = '',
): string {
  if (!validationErrors || validationErrors.length === 0) {
    return 'Invalid input';
  }

  const error = validationErrors[0];

  const fullPath = parentPath ? `${parentPath}.${error.property}` : error.property;

  if (error.constraints) {
    const firstConstraint = Object.values(error.constraints)[0];
    return `${fullPath}: ${firstConstraint}`;
  }

  const children: ValidationError[] = error.children ?? [];

  if (children.length > 0) {
    return getFirstValidateMsg(children, fullPath);
  }

  return `${fullPath}: Invalid input`;
}

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role, User } from '../users/user.entity';
import { DeliveryOrder } from './order.entity';

export const terminal = ['DELIVERED', 'CANCELLED', 'FAILED'];
export const transitions: Record<string, [string, string]> = {
  start: ['ASSIGNED', 'ARRIVING_PICKUP'],
  'arrive-pickup': ['ARRIVING_PICKUP', 'AT_PICKUP'],
  'confirm-pickup': ['AT_PICKUP', 'PICKED_UP'],
  'start-transit': ['PICKED_UP', 'IN_TRANSIT'],
  'arrive-destination': ['IN_TRANSIT', 'AT_DESTINATION'],
  complete: ['AT_DESTINATION', 'DELIVERED'],
};
export function nextStatus(
  trip: DeliveryOrder,
  user: User,
  action: string,
  reason?: string,
) {
  if (action === 'cancel') {
    if (
      trip.customerId !== user.id &&
      !(trip.riderId === user.id && trip.status === 'ASSIGNED')
    )
      throw new ForbiddenException();
    if (trip.startedAt)
      throw new ConflictException(
        'TRIP_ALREADY_STARTED: This trip has started and cannot be cancelled.',
      );
    if (!['DRAFT', 'OPEN', 'ASSIGNED'].includes(trip.status))
      throw new ConflictException('This trip can no longer be cancelled.');
    if (!reason?.trim())
      throw new ConflictException('A cancellation reason is required.');
    return 'CANCELLED';
  }
  if (
    user.role !== Role.RIDER ||
    trip.riderId !== user.id ||
    !user.isRiderVerified
  )
    throw new ForbiddenException();
  const transition = transitions[action];
  if (!transition || trip.status !== transition[0])
    throw new ConflictException('Trip changed. Refresh before continuing.');
  return transition[1];
}

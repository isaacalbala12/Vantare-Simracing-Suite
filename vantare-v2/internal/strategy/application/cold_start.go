package application

import "context"

func (service *Service[T]) GetColdStartStatus(ctx context.Context, command ColdStartCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationGetColdStartStatus); err != nil {
		return Result[T]{}, err
	}
	result, err := service.coldStartResult(ctx, command.CommandID)
	if err != nil || service.coldStart == nil {
		return result, err
	}
	status, err := service.coldStart.Status(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result.ColdStartStatus = &status
	return result, nil
}

func (service *Service[T]) ImportColdStartNext(ctx context.Context, command ColdStartCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationImportColdStartNext); err != nil {
		return Result[T]{}, err
	}
	result, err := service.coldStartResult(ctx, command.CommandID)
	if err != nil || service.coldStart == nil {
		return result, err
	}
	progress, err := service.coldStart.ImportNext(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result.ColdStartProgress = &progress
	return result, nil
}

func (service *Service[T]) RetryColdStartFailures(ctx context.Context, command ColdStartCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationRetryColdStartFailures); err != nil {
		return Result[T]{}, err
	}
	result, err := service.coldStartResult(ctx, command.CommandID)
	if err != nil || service.coldStart == nil {
		return result, err
	}
	progress, err := service.coldStart.RetryFailures(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result.ColdStartProgress = &progress
	return result, nil
}

func (service *Service[T]) RejectColdStart(ctx context.Context, command ColdStartCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationRejectColdStart); err != nil {
		return Result[T]{}, err
	}
	result, err := service.coldStartResult(ctx, command.CommandID)
	if err != nil || service.coldStart == nil {
		return result, err
	}
	if err := service.coldStart.Reject(ctx); err != nil {
		return Result[T]{}, err
	}
	return result, nil
}

func (service *Service[T]) coldStartResult(ctx context.Context, commandID CommandID) (Result[T], error) {
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	return documentResult[T](commandID, snapshot), nil
}

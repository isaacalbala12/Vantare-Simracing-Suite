package application

import "context"

func (service *Service[T]) ListReferenceCatalog(ctx context.Context, command ListReferenceCatalogCommand) (Result[T], error) {
	if err := validateHeader(command.CommandHeader, OperationListReferenceCatalog); err != nil {
		return Result[T]{}, err
	}
	snapshot, err := service.repository.Snapshot(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result := documentResult[T](command.CommandID, snapshot)
	if service.referenceCatalog == nil {
		return result, nil
	}
	catalog, err := service.referenceCatalog.Load(ctx)
	if err != nil {
		return Result[T]{}, err
	}
	result.ReferenceCatalog = &catalog
	return result, nil
}

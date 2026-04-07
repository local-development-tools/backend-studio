import type { Request } from './types';

export const mockRequests: Request[] = [
  {
    id: 'http-1',
    name: 'Get Users',
    type: 'http',
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
    queryParams: [{ key: 'page', value: '1' }, { key: 'limit', value: '20' }],
    body: '',
  },
  {
    id: 'http-2',
    name: 'Create User',
    type: 'http',
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: [
      { key: 'Authorization', value: 'Bearer {{token}}' },
      { key: 'Content-Type', value: 'application/json' },
    ],
    queryParams: [],
    body: '{\n  "name": "John Doe",\n  "email": "john@example.com"\n}',
  },
  {
    id: 'http-3',
    name: 'Update User',
    type: 'http',
    method: 'PUT',
    url: 'https://api.example.com/users/123',
    headers: [
      { key: 'Authorization', value: 'Bearer {{token}}' },
      { key: 'Content-Type', value: 'application/json' },
    ],
    queryParams: [],
    body: '{\n  "name": "Jane Doe"\n}',
  },
  {
    id: 'http-4',
    name: 'Delete User',
    type: 'http',
    method: 'DELETE',
    url: 'https://api.example.com/users/123',
    headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
    queryParams: [],
    body: '',
  },
  {
    id: 'grpc-1',
    name: 'GetUser',
    type: 'grpc',
    serverAddress: 'localhost:50051',
    service: 'user.UserService',
    method: 'GetUser',
    protoContent: `syntax = "proto3";

package user;

service UserService {
  rpc GetUser (GetUserRequest) returns (User);
  rpc ListUsers (ListUsersRequest) returns (ListUsersResponse);
}

message GetUserRequest {
  string id = 1;
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
}`,
    message: '{\n  "id": "user-123"\n}',
    metadata: [{ key: 'authorization', value: 'Bearer {{token}}' }],
  },
  {
    id: 'grpc-2',
    name: 'ListUsers',
    type: 'grpc',
    serverAddress: 'localhost:50051',
    service: 'user.UserService',
    method: 'ListUsers',
    protoContent: '',
    message: '{\n  "page": 1,\n  "limit": 20\n}',
    metadata: [],
  },
];

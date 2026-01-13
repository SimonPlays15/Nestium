import { IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Data transfer object for registering a node.
 *
 * This class is used to validate and transfer data when a node is being registered. It includes
 * information about the node's authentication token, name, endpoint URL, and optional metadata
 * such as the agent version or node capacity.
 *
 * Properties:
 * - `token` (string): A required unique token used for authenticating and identifying the node.
 * - `name` (string): A required human-readable name for the node.
 * - `endpointUrl` (string): A required URL where the node's API endpoint can be reached.
 * - `agentVersion` (string, optional): An optional field representing the version of the agent
 *   running on the node.
 * - `capacity` (Record<string, unknown>, optional): An optional field containing details
 *   regarding the capacity specifications of the node, structured as key-value pairs.
 */
export class RegisterNodeDto {
  @IsString()
  token!: string;

  @IsString()
  name!: string;

  @IsUrl()
  endpointUrl!: string;

  @IsOptional()
  @IsString()
  agentVersion?: string;

  @IsOptional()
  @IsObject()
  capacity?: Record<string, unknown>;
}

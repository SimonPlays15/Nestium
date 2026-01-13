import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NodesService } from './nodes.service';
import { CreateEnrollmentDto } from './dto/create-enroll.dto';
import { RegisterNodeDto } from './dto/register-node.dto';
import { CreateAllocationsDto } from './dto/create-allocations.dto';

/**
 * Controller responsible for handling operations related to nodes, including enrollment, health checks, and node management.
 */
@Controller('nodes')
export class NodesController {
  constructor(private nodes: NodesService) {}

  /**
   * Enrollment & Health
   */
  @Post('enroll')
  createEnrollment(@Body() dto: CreateEnrollmentDto) {
    // TODO: Authentication via "Admin"
    return this.nodes.createEnrollment(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterNodeDto) {
    return this.nodes.registerNode(dto);
  }

  /**
   * Nodes
   */
  @Get()
  listNodes() {
    return this.nodes.listNodes();
  }
  @Get(':id')
  getNode(@Param('id') id: string) {
    return this.nodes.getNode(id);
  }

  @Post(':id/ping')
  ping(@Param('id') id: string) {
    return this.nodes.pingNode(id);
  }

  @Post(':id/auth-test')
  authTest(@Param('id') id: string, @Body() body: any) {
    return this.nodes.authTest(id, body);
  }

  @Post('ping-all')
  pingAll() {
    return this.nodes.pingAllNodes();
  }

  @Post(':id/allocations')
  createAllocations(
    @Param('id') id: string,
    @Body() dto: CreateAllocationsDto,
  ) {
    return this.nodes.createAllocations(id, dto);
  }
}

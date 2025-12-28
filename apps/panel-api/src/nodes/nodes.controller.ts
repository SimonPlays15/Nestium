import { Body, Controller, Post } from "@nestjs/common";
import { NodesService } from "./nodes.service";
import { CreateEnrollmentDto } from "./dto/create-enroll.dto";
import { RegisterNodeDto } from "./dto/register-node.dto";

@Controller("nodes")
export class NodesController {
    constructor(private nodes: NodesService) {}

    // MVP: ohne Auth (später Admin Guard)
    @Post("enroll")
    createEnrollment(@Body() dto: CreateEnrollmentDto) {
        return this.nodes.createEnrollment(dto);
    }

    @Post("register")
    register(@Body() dto: RegisterNodeDto) {
        return this.nodes.registerNode(dto);
    }
}
